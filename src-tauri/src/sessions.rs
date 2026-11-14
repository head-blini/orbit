//! 세션 로그(JSONL) 파서와 세션 상태 집계.
use serde_json::Value;
use std::collections::{HashMap, HashSet};

pub const MAX_EVENTS: usize = 500;
pub const MAX_AGENTS: usize = 200;
pub const STALL_MS: u64 = 600_000;

#[derive(Clone, Copy, PartialEq, Debug, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Source { Hook, Log, Both }

#[derive(Clone, Copy, PartialEq, Debug, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase { Call, Result }

#[derive(Clone, Copy, PartialEq, Debug, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State { Working, Waiting, Done, Error }

#[derive(Clone, Copy, PartialEq, Debug, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeState { Running, Waiting, Done, Failed, Unknown }

#[derive(Clone, serde::Serialize)]
pub struct Agent {
    pub tool_use_id: Option<String>,
    pub agent_id: Option<String>,
    pub kind: Option<String>,
    pub description: Option<String>,
    pub state: NodeState,
    pub started_ms: Option<u64>,
    pub duration_ms: Option<u64>,
    pub tokens: Option<u64>,
}

#[derive(Clone, serde::Serialize)]
pub struct Event {
    #[serde(skip)]
    pub key: String,
    pub tool_use_id: Option<String>,
    pub phase: Phase,
    pub tool: String,
    pub at_ms: u64,
    pub source: Source,
}

#[derive(Clone, serde::Serialize)]
pub struct Session {
    pub id: String,
    pub cwd: Option<String>,
    pub started_ms: Option<u64>,
    pub last_ms: u64,
    pub source: Source,
    pub ver: u64,
    pub state: State,
    pub agents: Vec<Agent>,
    pub stalled: bool,
    /// 내부 중복 제거 전용. 화면으로 보내지 않는다.
    #[serde(skip)]
    pub events: Vec<Event>,
}

/// 내보내기용 복제본. 멈춤 판정은 여기서만 한다.
pub fn snapshot(s: &Session, now: u64) -> Session {
    let mut c = s.clone();
    c.stalled = s.state == State::Working && now.saturating_sub(s.last_ms) > STALL_MS;
    c
}

#[derive(Default)]
pub struct Store {
    sessions: HashMap<String, Session>,
    seen: HashMap<String, HashSet<String>>,
    ver: u64,
}

fn merge(a: Source, b: Source) -> Source {
    if a == b { a } else { Source::Both }
}

fn add_event(sess: &mut Session, seen: &mut HashSet<String>, ev: Event) {
    if seen.insert(ev.key.clone()) {
        sess.events.push(ev);
        if sess.events.len() > MAX_EVENTS {
            sess.events.remove(0);
        }
    } else if let Some(e) = sess.events.iter_mut().find(|e| e.key == ev.key) {
        e.source = merge(e.source, ev.source);
        if e.tool.is_empty() {
            e.tool = ev.tool;
        }
    }
}

impl Store {
    /// 세션을 만들거나 갱신하고 ver를 올린다.
    fn touch(&mut self, id: &str, source: Source, cwd: Option<&str>, at: u64, started: Option<u64>) {
        self.ver += 1;
        let ver = self.ver;
        let s = self.sessions.entry(id.to_string()).or_insert_with(|| Session {
            id: id.to_string(),
            cwd: None,
            started_ms: None,
            last_ms: 0,
            source,
            ver,
            state: State::Working,
            agents: Vec::new(),
            stalled: false,
            events: Vec::new(),
        });
        s.ver = ver;
        s.source = merge(s.source, source);
        s.last_ms = s.last_ms.max(at);
        if s.cwd.is_none() {
            s.cwd = cwd.map(str::to_string);
        }
        if s.started_ms.is_none() {
            s.started_ms = started;
        }
    }

    fn push(&mut self, sid: &str, ev: Event) {
        let seen = self.seen.entry(sid.to_string()).or_default();
        if let Some(s) = self.sessions.get_mut(sid) {
            add_event(s, seen, ev);
        }
    }

    pub fn ingest_hook(&mut self, v: &Value, now_ms: u64) -> Option<String> {
        let sid = v.get("session_id")?.as_str()?;
        self.touch(sid, Source::Hook, v.get("cwd").and_then(Value::as_str), now_ms, None);
        let name = v.get("hook_event_name").and_then(Value::as_str);
        let note = v.get("notification_type").and_then(Value::as_str);
        let state = match (name, note) {
            (Some("UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolUseFailure"), _) => Some(State::Working),
            (Some("PermissionRequest"), _) | (Some("Notification"), Some("permission_prompt")) => Some(State::Waiting),
            (Some("Stop" | "SessionEnd"), _) | (Some("Notification"), Some("idle_prompt")) => Some(State::Done),
            (Some("StopFailure"), _) => Some(State::Error),
            _ => None,
        };
        if let (Some(st), Some(s)) = (state, self.sessions.get_mut(sid)) {
            s.state = st;
        }
        let phase = match name {
            Some("PreToolUse") => Phase::Call,
            Some("PostToolUse") | Some("PostToolUseFailure") => Phase::Result,
            _ => return Some(sid.to_string()),
        };
        if let Some(id) = v.get("tool_use_id").and_then(Value::as_str) {
            let ev = Event {
                key: format!("{}:{id}", if phase == Phase::Call { "call" } else { "result" }),
                tool_use_id: Some(id.to_string()),
                phase,
                tool: v.get("tool_name").and_then(Value::as_str).unwrap_or("").to_string(),
                at_ms: now_ms,
                source: Source::Hook,
            };
            self.push(sid, ev);
        }
        Some(sid.to_string())
    }

    pub fn ingest_log(&mut self, session: &str, v: &Value, read_ms: u64) -> Option<String> {
        let obj = v.as_object()?;
        let ts = obj.get("timestamp").and_then(Value::as_str).and_then(parse_ms);
        let at = ts.unwrap_or(read_ms);
        // timestamp 없는 줄은 last_ms를 올리지 못한다(max)
        self.touch(session, Source::Log, obj.get("cwd").and_then(Value::as_str), ts.unwrap_or(0), ts);
        let uuid = obj.get("uuid").and_then(Value::as_str);
        let blocks = obj.get("message").and_then(|m| m.get("content")).and_then(Value::as_array);
        for (i, b) in blocks.into_iter().flatten().enumerate() {
            let (phase, id) = match b.get("type").and_then(Value::as_str) {
                Some("tool_use") => (Phase::Call, b.get("id")),
                Some("tool_result") => (Phase::Result, b.get("tool_use_id")),
                _ => continue,
            };
            let id = id.and_then(Value::as_str);
            let pn = if phase == Phase::Call { "call" } else { "result" };
            let key = match (id, uuid) {
                (Some(id), _) => format!("{pn}:{id}"),
                (None, Some(u)) => format!("uuid:{u}:{i}"),
                (None, None) => continue,
            };
            let tool = if phase == Phase::Call {
                b.get("name").and_then(Value::as_str).map(str::to_string)
            } else {
                id.and_then(|id| {
                    let call = format!("call:{id}");
                    self.sessions.get(session)?.events.iter().rfind(|e| e.key == call)
                })
                    .map(|e| e.tool.clone())
            };
            let ev = Event {
                key,
                tool_use_id: id.map(str::to_string),
                phase,
                tool: tool.unwrap_or_default(),
                at_ms: at,
                source: Source::Log,
            };
            self.push(session, ev);
        }
        Some(session.to_string())
    }

    pub fn get(&self, id: &str) -> Option<&Session> {
        self.sessions.get(id)
    }

    pub fn all(&self) -> Vec<Session> {
        self.sessions.values().cloned().collect()
    }
}

fn num(s: &str, a: usize, b: usize) -> Option<i64> {
    let t = s.get(a..b)?;
    if t.is_empty() || !t.bytes().all(|c| c.is_ascii_digit()) {
        return None;
    }
    t.parse().ok()
}

/// `YYYY-MM-DDTHH:MM:SS[.fff]Z`(UTC)만 받는다. 1970 이전·범위 밖은 None.
pub fn parse_ms(ts: &str) -> Option<u64> {
    let sep = |i: usize, c: &str| (ts.get(i..i + 1) == Some(c)).then_some(());
    sep(4, "-")?;
    sep(7, "-")?;
    sep(10, "T")?;
    sep(13, ":")?;
    sep(16, ":")?;
    let (y, mo, d) = (num(ts, 0, 4)?, num(ts, 5, 7)?, num(ts, 8, 10)?);
    let (h, mi, s) = (num(ts, 11, 13)?, num(ts, 14, 16)?, num(ts, 17, 19)?);
    if y < 1970 || !(1..=12).contains(&mo) || !(1..=31).contains(&d) || h > 23 || mi > 59 || s > 59 {
        return None;
    }
    let rest = ts.get(19..)?;
    let ms = if rest == "Z" {
        0
    } else {
        let frac = rest.strip_prefix('.')?.strip_suffix('Z')?;
        if frac.is_empty() || !frac.bytes().all(|c| c.is_ascii_digit()) {
            return None;
        }
        let f = format!("{:0<3}", frac.get(..3.min(frac.len()))?);
        f.parse::<i64>().ok()?
    };
    // days from civil (Howard Hinnant)
    let yy = if mo <= 2 { y - 1 } else { y };
    let era = yy / 400;
    let yoe = yy - era * 400;
    let doy = (153 * (if mo > 2 { mo - 3 } else { mo + 9 }) + 2) / 5 + d - 1;
    let days = era * 146097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719468;
    u64::try_from((((days * 24 + h) * 60 + mi) * 60 + s) * 1000 + ms).ok()
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .and_then(|d| u64::try_from(d.as_millis()).ok())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const S: &str = "s1";

    fn use_line(id: &str, name: &str) -> Value {
        json!({"timestamp":"2000-03-01T00:00:00.000Z","cwd":"/w","uuid":"u1",
            "message":{"content":[{"type":"tool_use","id":id,"name":name}]}})
    }
    fn res_line(id: &str) -> Value {
        json!({"timestamp":"2000-03-01T00:00:01Z","message":{"content":[{"type":"tool_result","tool_use_id":id}]}})
    }
    fn hook(ev: &str, id: Option<&str>) -> Value {
        json!({"hook_event_name":ev,"session_id":S,"tool_use_id":id,"tool_name":"Read"})
    }
    fn evs(st: &Store) -> &Vec<Event> {
        &st.get(S).unwrap().events
    }

    #[test]
    fn a_log_tool_use() {
        let mut st = Store::default();
        assert_eq!(st.ingest_log(S, &use_line("t1", "Read"), 5).as_deref(), Some(S));
        let s = st.get(S).unwrap();
        assert_eq!(s.source, Source::Log);
        assert_eq!(s.cwd.as_deref(), Some("/w"));
        assert_eq!(s.started_ms, Some(951868800000));
        let e = &s.events[0];
        assert_eq!((e.phase, e.tool.as_str(), e.source), (Phase::Call, "Read", Source::Log));
        assert_eq!(e.at_ms, 951868800000);
    }

    #[test]
    fn b_hook_and_log_call_both_orders() {
        let mut st = Store::default();
        st.ingest_hook(&hook("PreToolUse", Some("t1")), 1);
        st.ingest_log(S, &use_line("t1", "Read"), 2);
        assert_eq!(evs(&st).len(), 1);
        assert_eq!(evs(&st)[0].source, Source::Both);
        assert_eq!(evs(&st)[0].at_ms, 1);
        assert_eq!(st.get(S).unwrap().source, Source::Both);

        let mut st = Store::default();
        st.ingest_log(S, &use_line("t1", "Read"), 2);
        st.ingest_hook(&hook("PreToolUse", Some("t1")), 1);
        assert_eq!(evs(&st).len(), 1);
        assert_eq!(evs(&st)[0].source, Source::Both);
    }

    #[test]
    fn c_results() {
        for ev in ["PostToolUse", "PostToolUseFailure"] {
            let mut st = Store::default();
            st.ingest_hook(&hook(ev, Some("t1")), 1);
            st.ingest_log(S, &res_line("t1"), 2);
            assert_eq!(evs(&st).len(), 1);
            assert_eq!((evs(&st)[0].phase, evs(&st)[0].source), (Phase::Result, Source::Both));
        }
        let mut st = Store::default();
        st.ingest_log(S, &use_line("t1", "Read"), 1);
        st.ingest_log(S, &res_line("t1"), 2);
        assert_eq!(evs(&st).len(), 2);
        assert_eq!((evs(&st)[1].phase, evs(&st)[1].tool.as_str()), (Phase::Result, "Read"));
    }

    #[test]
    fn d_duplicates() {
        let mut st = Store::default();
        st.ingest_log(S, &use_line("t1", "Read"), 1);
        st.ingest_log(S, &use_line("t1", "Read"), 1);
        assert_eq!(evs(&st).len(), 1);
        let line = json!({"uuid":"x9","message":{"content":[{"type":"tool_use","name":"Bash"}]}});
        let mut st = Store::default();
        st.ingest_log(S, &line, 1);
        st.ingest_log(S, &line, 1);
        assert_eq!(evs(&st).len(), 1);
        assert_eq!(evs(&st)[0].tool_use_id, None);
        // id도 uuid도 없으면 항목 없음
        let line = json!({"message":{"content":[{"type":"tool_use","name":"Bash"}]}});
        st.ingest_log("s2", &line, 1);
        assert_eq!(st.get("s2").unwrap().events.len(), 0);
    }

    #[test]
    fn e_two_blocks() {
        let line = json!({"message":{"content":[
            {"type":"tool_use","id":"a","name":"Read"},{"type":"tool_use","id":"b","name":"Bash"}]}});
        let mut st = Store::default();
        st.ingest_log(S, &line, 1);
        assert_eq!(evs(&st).len(), 2);
    }

    #[test]
    fn f_g_no_panic_on_odd_shapes() {
        let odd = [
            json!([1, 2]), json!(5), json!("x"), json!(null),
            json!({"type":5,"message":{"content":[{"type":"tool_use","id":"q","name":"R"}]}}),
            json!({"type":{"a":1}}),
            json!({"message":"str"}),
            json!({"message":{"content":{"a":1}}}),
            json!({"message":{"content":["s", 1, null, [], {"type":7}]}}),
            json!({"message":{"content":[{"type":"tool_use","id":3,"name":4}]}}),
            json!({"timestamp":5,"cwd":6,"uuid":7,"zzz":1}),
            json!({"type":"zzz"}),
        ];
        let mut st = Store::default();
        for v in &odd {
            st.ingest_log(S, v, 1);
            st.ingest_hook(v, 1);
        }
        assert_eq!(evs(&st).len(), 1); // type이 숫자여도 content의 tool_use는 본다
        let mut st = Store::default();
        st.ingest_log(S, &json!({"type":"zzz"}), 1);
        assert_eq!(evs(&st).len(), 0);
    }

    #[test]
    fn h_hook_upsert_only() {
        let mut st = Store::default();
        let v = json!({"hook_event_name":"UserPromptSubmit","session_id":S,"cwd":"/h"});
        assert_eq!(st.ingest_hook(&v, 9).as_deref(), Some(S));
        let s = st.get(S).unwrap();
        assert_eq!((s.source, s.events.len(), s.started_ms, s.last_ms), (Source::Hook, 0, None, 9));
        assert_eq!(s.cwd.as_deref(), Some("/h"));
        assert!(st.ingest_hook(&json!({"hook_event_name":"Stop"}), 1).is_none());
        assert!(st.ingest_hook(&json!({"session_id":3}), 1).is_none());
        // tool_use_id 없는 PreToolUse: 세션만
        let mut st = Store::default();
        assert!(st.ingest_hook(&hook("PreToolUse", None), 1).is_some());
        assert_eq!(evs(&st).len(), 0);
        let v = json!({"hook_event_name":"PreToolUse","session_id":S,"tool_use_id":5});
        st.ingest_hook(&v, 1);
        assert_eq!(evs(&st).len(), 0);
    }

    #[test]
    fn i_cap_and_no_revive() {
        let mut st = Store::default();
        for i in 0..=MAX_EVENTS {
            st.ingest_log(S, &use_line(&format!("t{i}"), "Read"), 1);
        }
        assert_eq!(evs(&st).len(), MAX_EVENTS);
        assert_eq!(evs(&st)[0].tool_use_id.as_deref(), Some("t1"));
        st.ingest_log(S, &use_line("t0", "Read"), 1);
        assert_eq!(evs(&st).len(), MAX_EVENTS);
        assert_eq!(evs(&st)[0].tool_use_id.as_deref(), Some("t1"));
    }

    #[test]
    fn j_ver_increases() {
        let mut st = Store::default();
        st.ingest_log(S, &use_line("t1", "Read"), 1);
        let v1 = st.get(S).unwrap().ver;
        st.ingest_hook(&hook("PreToolUse", Some("t1")), 2);
        let v2 = st.get(S).unwrap().ver;
        assert!(v2 > v1);
        st.ingest_log("s2", &use_line("t1", "Read"), 1);
        assert!(st.get("s2").unwrap().ver > v2);
    }

    #[test]
    fn k_parse_ms() {
        assert_eq!(parse_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_ms("2000-03-01T00:00:00.000Z"), Some(951868800000));
        assert_eq!(parse_ms("2000-03-01T00:00:00.5Z"), Some(951868800500));
        for bad in [
            "2000-03-01T00:00:00+09:00", "x", "", "2000-13-01T00:00:00Z", "1969-12-31T23:59:59Z",
            "2000-01-32T00:00:00Z", "2000-01-01T24:00:00Z", "2000-01-01T00:60:00Z",
            "2000-03-01T00:00:00.Z", "+000-03-01T00:00:00Z", "2000-03-01T00:00:00Zx", "2000-03-01é",
        ] {
            assert_eq!(parse_ms(bad), None, "{bad}");
        }
    }

    fn st_of(st: &Store) -> State {
        st.get(S).unwrap().state
    }
    fn h(ev: &str) -> Value {
        json!({"hook_event_name":ev,"session_id":S})
    }
    fn notif(t: Value) -> Value {
        json!({"hook_event_name":"Notification","session_id":S,"notification_type":t})
    }

    #[test]
    fn l_state_table() {
        let mut st = Store::default();
        let steps = [
            (h("UserPromptSubmit"), State::Working), (h("PermissionRequest"), State::Waiting),
            (h("PreToolUse"), State::Working), (notif(json!("permission_prompt")), State::Waiting),
            (h("PostToolUse"), State::Working), (h("Stop"), State::Done),
            (h("StopFailure"), State::Error), (h("UserPromptSubmit"), State::Working),
            (notif(json!("idle_prompt")), State::Done), (h("SessionEnd"), State::Done),
            (h("SubagentStart"), State::Done), (notif(json!("auth_success")), State::Done),
            (notif(json!(5)), State::Done), (h("Zzz"), State::Done),
        ];
        for (v, want) in steps {
            st.ingest_hook(&v, 1);
            assert_eq!(st_of(&st), want, "{v}");
        }
    }

    #[test]
    fn m_log_does_not_change_state() {
        let mut st = Store::default();
        st.ingest_log(S, &use_line("t1", "Read"), 1);
        assert_eq!(st_of(&st), State::Working);
        st.ingest_hook(&h("Stop"), 1);
        st.ingest_log(S, &res_line("t1"), 2);
        assert_eq!(st_of(&st), State::Done);
    }

    #[test]
    fn n_last_ms_only_from_timestamps() {
        let mut st = Store::default();
        st.ingest_log(S, &use_line("t1", "Read"), 5);
        st.ingest_log(S, &json!({"uuid":"z"}), 9_000_000_000_000);
        assert_eq!(st.get(S).unwrap().last_ms, 951868800000);
        st.ingest_log("s2", &json!({"uuid":"z"}), 9_000_000_000_000);
        assert_eq!(st.get("s2").unwrap().last_ms, 0);
    }

    #[test]
    fn o_fill_empty_tool() {
        let mut st = Store::default();
        st.ingest_log(S, &res_line("t1"), 1);
        assert_eq!(evs(&st)[0].tool, "");
        st.ingest_hook(&hook("PostToolUse", Some("t1")), 2);
        assert_eq!(evs(&st).len(), 1);
        assert_eq!(evs(&st)[0].tool, "Read");
    }

    #[test]
    fn p_json_shape() {
        let mut st = Store::default();
        st.ingest_hook(&hook("PreToolUse", Some("t1")), 1);
        st.ingest_log(S, &use_line("t1", "Read"), 2);
        let v = serde_json::to_value(st.get(S).unwrap()).unwrap();
        assert_eq!(v["source"], "both");
        assert_eq!(v["state"], "working");
        assert_eq!(v["agents"], json!([]));
        assert_eq!(v["stalled"], false);
        assert!(v.get("events").is_none());
    }

    #[test]
    fn q_snapshot_stall() {
        let mut st = Store::default();
        st.ingest_hook(&h("UserPromptSubmit"), 1000);
        let s = st.get(S).unwrap();
        assert!(!snapshot(s, 1000 + STALL_MS).stalled);
        let late = snapshot(s, 1000 + STALL_MS + 1);
        assert!(late.stalled);
        assert_eq!(serde_json::to_value(&late).unwrap()["stalled"], true);
        assert!(!snapshot(s, 5).stalled);
        assert!(!st.get(S).unwrap().stalled);
        for (ev, want) in [("PermissionRequest", State::Waiting), ("Stop", State::Done), ("StopFailure", State::Error)] {
            st.ingest_hook(&h(ev), 1000);
            let s = st.get(S).unwrap();
            assert_eq!(s.state, want);
            assert!(!snapshot(s, 1000 + STALL_MS + 1).stalled);
        }
        st.ingest_log("s2", &json!({"uuid":"z"}), 1);
        assert!(snapshot(st.get("s2").unwrap(), 9_000_000_000_000).stalled);
    }
}
