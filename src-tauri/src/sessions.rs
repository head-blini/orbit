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
    /// 단계 열(1부터). 생성 때 한 번 정해지고 합치기(min) 외에는 바뀌지 않는다.
    pub col: u32,
    /// 만들어질 때 세션의 run 세대. 화면으로 보내지 않는다.
    #[serde(skip)]
    pub run_gen: u32,
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
    /// 지금 run id(`.orbit/current`에 쓴 값, 패턴을 통과한 것만).
    pub run: Option<String>,
    #[serde(skip)]
    pub run_gen: u32,
    /// 내부 중복 제거 전용. 화면으로 보내지 않는다.
    #[serde(skip)]
    pub events: Vec<Event>,
}

/// 내보내기용 복제본. 멈춤 판정은 여기서만 한다.
pub fn snapshot(s: &Session, now: u64) -> Session {
    stalled(s.clone(), now)
}

/// 표시용 노드 이름: 마지막 `:` 뒤. 비면 None.
pub fn short_kind(k: &str) -> Option<String> {
    k.rsplit(':').next().filter(|s| !s.is_empty()).map(str::to_string)
}

/// 내보내기 직전: 멈춤 판정 + 표시용 kind. 이미 복제한 값을 소비한다.
pub fn stalled(mut c: Session, now: u64) -> Session {
    c.stalled = c.state == State::Working && now.saturating_sub(c.last_ms) > STALL_MS;
    let g = c.run_gen;
    c.agents.retain(|a| a.run_gen == g);
    for a in &mut c.agents {
        a.kind = a.kind.as_deref().and_then(short_kind);
    }
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

fn is_agent_tool(name: Option<&str>) -> bool {
    matches!(name, Some("Agent" | "Task")) // "Task"는 옛 이름(미확인)
}

/// tool_use_id 노드의 위치. 없으면 만들고(가장 오래된 노드부터 뺀다) 새 위치를 돌려준다.
fn node_by_tool(agents: &mut Vec<Agent>, tuid: &str, rg: u32) -> usize {
    if let Some(i) = agents.iter().position(|a| a.tool_use_id.as_deref() == Some(tuid)) {
        return i;
    }
    push_agent(agents, Some(tuid.to_string()), None, NodeState::Unknown, None, rg)
}

fn push_agent(agents: &mut Vec<Agent>, tuid: Option<String>, aid: Option<String>, state: NodeState, started: Option<u64>, rg: u32) -> usize {
    // 마지막 열에 이미 끝난 노드가 하나라도 있으면 다음 열. 시각이 아니라 생성 순서로 안다.
    let last = agents.iter().map(|a| a.col).max().unwrap_or(1);
    let finished = agents.iter().any(|a| a.col == last && matches!(a.state, NodeState::Done | NodeState::Failed));
    let col = if finished { last.saturating_add(1) } else { last };
    agents.push(Agent { tool_use_id: tuid, agent_id: aid, kind: None, description: None, state, started_ms: started, duration_ms: None, tokens: None, col, run_gen: rg });
    if agents.len() > MAX_AGENTS {
        agents.remove(0);
    }
    agents.len() - 1
}

/// `.orbit/current`에 run id를 쓰는 Write·Edit면 그 id. 경로는 문자열 비교에만 쓴다.
pub fn run_start(tool: Option<&str>, input: Option<&Value>) -> Option<String> {
    let input = input?;
    let path = input.get("file_path")?.as_str()?;
    if !(path == ".orbit/current" || path.ends_with("/.orbit/current") || path.ends_with("\\.orbit\\current")) {
        return None;
    }
    let key = match tool? {
        "Write" => "content",
        "Edit" => "new_string",
        _ => return None,
    };
    let v = input.get(key)?.as_str()?.trim();
    let ok = !v.is_empty() && v.len() <= 128 && !v.starts_with('.') && v.bytes().all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'.' | b'-'));
    ok.then(|| v.to_string())
}

const MAX_ID: usize = 256;
const MAX_TEXT: usize = 256;
const MAX_CWD: usize = 4096;

/// id류 문자열. 너무 길면 없는 값으로 본다.
fn id_str(v: Option<&Value>) -> Option<&str> {
    v.and_then(Value::as_str).filter(|s| s.len() <= MAX_ID)
}

/// 표시용 문자열. 문자 경계에서 MAX_TEXT자로 자른다.
fn text(v: Option<&Value>) -> Option<String> {
    v.and_then(Value::as_str).map(|s| s.chars().take(MAX_TEXT).collect())
}

fn nonempty(v: Option<&Value>) -> Option<String> {
    text(v).filter(|s| !s.is_empty())
}

/// 비어 있는 칸만 채운다.
fn fill_from_input(a: &mut Agent, input: Option<&Value>) {
    if a.kind.is_none() {
        a.kind = text(input.and_then(|i| i.get("subagent_type")));
    }
    if a.description.is_none() {
        a.description = text(input.and_then(|i| i.get("description")));
    }
}

fn hook_agents(agents: &mut Vec<Agent>, v: &Value, name: &str, now: u64, rg: u32) {
    let aid = id_str(v.get("agent_id"));
    let tuid = id_str(v.get("tool_use_id"));
    let by_aid = |ag: &[Agent], id: &str| ag.iter().position(|a| a.agent_id.as_deref() == Some(id));
    let tool_node = is_agent_tool(v.get("tool_name").and_then(Value::as_str)) && aid.is_none();
    match name {
        "PreToolUse" | "PostToolUse" | "PostToolUseFailure" | "PermissionRequest" | "Notification" => {
            let waits = name == "PermissionRequest" || v.get("notification_type").and_then(Value::as_str) == Some("permission_prompt");
            if let Some(i) = aid.and_then(|id| by_aid(agents, id)) {
                match (waits, agents[i].state) {
                    (true, NodeState::Running) => agents[i].state = NodeState::Waiting,
                    (false, NodeState::Waiting) if matches!(name, "PreToolUse" | "PostToolUse" | "PostToolUseFailure") => agents[i].state = NodeState::Running,
                    _ => {}
                }
            }
        }
        _ => {}
    }
    match name {
        "PreToolUse" if tool_node => {
            let Some(t) = tuid else { return };
            let i = node_by_tool(agents, t, rg);
            let a = &mut agents[i];
            fill_from_input(a, v.get("tool_input"));
            a.started_ms.get_or_insert(now);
            if a.state == NodeState::Unknown {
                a.state = NodeState::Running;
            }
        }
        "PostToolUseFailure" if tool_node => {
            if let Some(t) = tuid {
                let i = node_by_tool(agents, t, rg);
                agents[i].state = NodeState::Failed;
            }
        }
        "PostToolUse" if tool_node => {
            let Some(t) = tuid else { return };
            let mut i = node_by_tool(agents, t, rg);
            let Some(r) = v.get("tool_response").and_then(Value::as_object) else { return };
            if let Some(id) = id_str(r.get("agentId")) {
                if let Some(j) = agents.iter().enumerate().position(|(k, a)| k != i && a.agent_id.as_deref() == Some(id)) {
                    if agents[j].tool_use_id.is_some() {
                        // 자기 호출을 가진 노드는 합치지 않는다. 엇갈린 짝짓기였으니 id만 비운다.
                        agents[j].agent_id = None;
                    } else {
                        let o = agents.remove(j);
                        if j < i {
                            i -= 1;
                        }
                        let a = &mut agents[i];
                        a.kind = a.kind.take().or(o.kind);
                        a.description = a.description.take().or(o.description);
                        a.started_ms = a.started_ms.into_iter().chain(o.started_ms).min();
                        a.duration_ms = a.duration_ms.or(o.duration_ms);
                        a.tokens = a.tokens.or(o.tokens);
                        a.col = a.col.min(o.col);
                    }
                }
                agents[i].agent_id = Some(id.to_string());
            }
            let a = &mut agents[i];
            if let Some(t) = r.get("totalTokens").and_then(Value::as_u64) {
                a.tokens = Some(t);
            }
            if let Some(d) = r.get("totalDurationMs").and_then(Value::as_u64) {
                a.duration_ms = Some(d);
            }
            a.state = if r.get("status").and_then(Value::as_str) == Some("async_launched") { NodeState::Running } else { NodeState::Done };
        }
        "SubagentStart" => {
            let Some(id) = aid else { return };
            if let Some(i) = by_aid(agents, id) {
                agents[i].state = NodeState::Running;
            } else if let Some(ty) = nonempty(v.get("agent_type")) {
                // 추정 짝짓기: agent_id 없는 가장 오래된 running 노드 중 kind가 같거나 없는 것
                let pair = agents.iter().position(|a| a.run_gen == rg && a.agent_id.is_none() && a.state == NodeState::Running && a.kind.as_deref().is_none_or(|k| k == ty.as_str()));
                let i = pair.unwrap_or_else(|| push_agent(agents, None, None, NodeState::Running, Some(now), rg));
                let a = &mut agents[i];
                a.agent_id = Some(id.to_string());
                a.kind.get_or_insert_with(|| ty.to_string());
            }
        }
        "SubagentStop" => {
            let Some(id) = aid else { return };
            if let Some(i) = by_aid(agents, id) {
                let a = &mut agents[i];
                if matches!(a.state, NodeState::Running | NodeState::Waiting) {
                    a.state = NodeState::Done;
                    if a.duration_ms.is_none() {
                        a.duration_ms = a.started_ms.map(|s| now.saturating_sub(s));
                    }
                }
            } else if let Some(ty) = nonempty(v.get("agent_type")) {
                let i = push_agent(agents, None, Some(id.to_string()), NodeState::Done, None, rg);
                agents[i].kind = Some(ty.to_string());
            }
        }
        _ => {}
    }
}

fn log_agent(agents: &mut Vec<Agent>, b: &Value, phase: Phase, id: &str, ts: Option<u64>, rg: u32) {
    if phase == Phase::Call {
        if !is_agent_tool(b.get("name").and_then(Value::as_str)) {
            return;
        }
        let i = node_by_tool(agents, id, rg);
        let a = &mut agents[i];
        fill_from_input(a, b.get("input"));
        if a.started_ms.is_none() {
            a.started_ms = ts;
        }
    } else if let Some(a) = agents.iter_mut().find(|a| a.tool_use_id.as_deref() == Some(id)) {
        if b.get("is_error").and_then(Value::as_bool) == Some(true) {
            a.state = NodeState::Failed;
        } else if a.state == NodeState::Unknown {
            a.state = NodeState::Done;
        }
        // 실행 중·대기 노드의 시간은 훅(SubagentStop·Post)이 채운다
        if a.duration_ms.is_none() && !matches!(a.state, NodeState::Running | NodeState::Waiting) {
            a.duration_ms = a.started_ms.zip(ts).map(|(s, e)| e.saturating_sub(s));
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
            run: None,
            run_gen: 0,
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

    /// `.orbit/current` 쓰기면 run을 바꾼다. 같은 호출(call:<id>)을 이미 봤으면 적용하지 않는다.
    fn apply_run(&mut self, sid: &str, tool: Option<&str>, input: Option<&Value>, tuid: Option<&str>) {
        let Some(r) = run_start(tool, input) else { return };
        if tuid.is_some_and(|t| self.seen.get(sid).is_some_and(|s| s.contains(&format!("call:{t}")))) {
            return;
        }
        if let Some(s) = self.sessions.get_mut(sid) {
            if s.run.as_deref() != Some(r.as_str()) {
                s.run = Some(r);
                s.run_gen = s.run_gen.wrapping_add(1);
            }
        }
    }

    fn push(&mut self, sid: &str, ev: Event) {
        let seen = self.seen.entry(sid.to_string()).or_default();
        if let Some(s) = self.sessions.get_mut(sid) {
            add_event(s, seen, ev);
        }
    }

    pub fn ingest_hook(&mut self, v: &Value, now_ms: u64) -> Option<String> {
        let sid = id_str(v.get("session_id"))?;
        self.touch(sid, Source::Hook, v.get("cwd").and_then(Value::as_str).filter(|c| c.len() <= MAX_CWD), now_ms, None);
        let name = v.get("hook_event_name").and_then(Value::as_str);
        let note = v.get("notification_type").and_then(Value::as_str);
        let tool = v.get("tool_name").and_then(Value::as_str);
        let state = match (name, note) {
            (Some("PreToolUse"), _) if tool == Some("AskUserQuestion") => Some(State::Waiting),
            (Some("UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolUseFailure"), _) => Some(State::Working),
            (Some("PermissionRequest"), _) | (Some("Notification"), Some("permission_prompt")) => Some(State::Waiting),
            (Some("Stop" | "SessionEnd"), _) | (Some("Notification"), Some("idle_prompt")) => Some(State::Done),
            (Some("StopFailure"), _) => Some(State::Error),
            _ => None,
        };
        if let (Some(st), Some(s)) = (state, self.sessions.get_mut(sid)) {
            s.state = st;
        }
        if name == Some("PreToolUse") && v.get("agent_id").is_none() {
            self.apply_run(sid, tool, v.get("tool_input"), id_str(v.get("tool_use_id")));
        }
        if let (Some(n), Some(s)) = (name, self.sessions.get_mut(sid)) {
            let g = s.run_gen;
            hook_agents(&mut s.agents, v, n, now_ms, g);
        }
        let phase = match name {
            Some("PreToolUse") => Phase::Call,
            Some("PostToolUse") | Some("PostToolUseFailure") => Phase::Result,
            _ => return Some(sid.to_string()),
        };
        if let Some(id) = id_str(v.get("tool_use_id")) {
            let ev = Event {
                key: format!("{}:{id}", if phase == Phase::Call { "call" } else { "result" }),
                tool_use_id: Some(id.to_string()),
                phase,
                tool: text(v.get("tool_name")).unwrap_or_default(),
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
        self.touch(session, Source::Log, obj.get("cwd").and_then(Value::as_str).filter(|c| c.len() <= MAX_CWD), ts.unwrap_or(0), ts);
        let sidechain = obj.get("isSidechain").and_then(Value::as_bool) == Some(true);
        let uuid = id_str(obj.get("uuid"));
        let blocks = obj.get("message").and_then(|m| m.get("content")).and_then(Value::as_array);
        for (i, b) in blocks.into_iter().flatten().enumerate() {
            let (phase, id) = match b.get("type").and_then(Value::as_str) {
                Some("tool_use") => (Phase::Call, b.get("id")),
                Some("tool_result") => (Phase::Result, b.get("tool_use_id")),
                _ => continue,
            };
            let id = id_str(id);
            if phase == Phase::Call && !sidechain {
                self.apply_run(session, b.get("name").and_then(Value::as_str), b.get("input"), id);
            }
            if let (Some(id), Some(s), false) = (id, self.sessions.get_mut(session), sidechain) {
                let g = s.run_gen;
                log_agent(&mut s.agents, b, phase, id, ts, g);
            }
            let pn = if phase == Phase::Call { "call" } else { "result" };
            let key = match (id, uuid) {
                (Some(id), _) => format!("{pn}:{id}"),
                (None, Some(u)) => format!("uuid:{u}:{i}"),
                (None, None) => continue,
            };
            let tool = if phase == Phase::Call {
                text(b.get("name"))
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
    fn l2_ask_user_question_waits() {
        let mut st = Store::default();
        let tool = |ev: &str, t: Value| json!({"hook_event_name":ev,"session_id":S,"tool_name":t});
        let steps = [
            (tool("PreToolUse", json!("AskUserQuestion")), State::Waiting),
            (tool("PostToolUse", json!("AskUserQuestion")), State::Working),
            (tool("PreToolUse", json!("Read")), State::Working),
            (tool("PreToolUse", json!(5)), State::Working),
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

    fn ag(st: &Store) -> &Vec<Agent> {
        &st.get(S).unwrap().agents
    }
    fn ah(ev: &str, tool: &str, tuid: &str, extra: Value) -> Value {
        let mut v = json!({"hook_event_name":ev,"session_id":S,"tool_name":tool,"tool_use_id":tuid});
        for (k, x) in extra.as_object().unwrap() {
            v[k] = x.clone();
        }
        v
    }
    fn sub(ev: &str, aid: &str, ty: Value) -> Value {
        json!({"hook_event_name":ev,"session_id":S,"agent_id":aid,"agent_type":ty})
    }
    fn alog(id: &str, name: &str, input: Value, ts: &str, side: bool) -> Value {
        json!({"timestamp":ts,"isSidechain":side,
            "message":{"content":[{"type":"tool_use","id":id,"name":name,"input":input}]}})
    }
    fn rlog(id: &str, ts: &str, err: bool) -> Value {
        json!({"timestamp":ts,"message":{"content":[{"type":"tool_result","tool_use_id":id,"is_error":err}]}})
    }

    #[test]
    fn short_kind_strips_prefix() {
        assert_eq!(short_kind("orbit:qa").as_deref(), Some("qa"));
        assert_eq!(short_kind("orbit:engineer").as_deref(), Some("engineer"));
        assert_eq!(short_kind("general-purpose").as_deref(), Some("general-purpose"));
        assert_eq!(short_kind("a:b:c").as_deref(), Some("c"));
        assert_eq!(short_kind("orbit:"), None);
        assert_eq!(short_kind(""), None);
    }

    #[test]
    fn snapshot_shortens_kind_but_store_keeps_original() {
        let mut st = Store::default();
        let inp = json!({"tool_input":{"subagent_type":"orbit:qa"}});
        st.ingest_hook(&ah("PreToolUse", "Agent", "t1", inp), 100);
        let snap = snapshot(st.get(S).unwrap(), 100);
        assert_eq!(snap.agents[0].kind.as_deref(), Some("qa"));
        assert!(!serde_json::to_value(&snap).unwrap().to_string().contains("orbit:"));
        assert_eq!(ag(&st)[0].kind.as_deref(), Some("orbit:qa"));
        st.ingest_hook(&sub("SubagentStart", "a1", json!("orbit:qa")), 110);
        assert_eq!(ag(&st).len(), 1);
    }

    #[test]
    fn r_agent_lifecycle() {
        let mut st = Store::default();
        let inp = json!({"tool_input":{"subagent_type":"engineer","description":"d"}});
        st.ingest_hook(&ah("PreToolUse", "Agent", "t1", inp), 100);
        assert_eq!((ag(&st).len(), ag(&st)[0].state), (1, NodeState::Running));
        assert_eq!(ag(&st)[0].kind.as_deref(), Some("engineer"));
        assert_eq!(ag(&st)[0].description.as_deref(), Some("d"));
        st.ingest_hook(&sub("SubagentStart", "a1", json!("engineer")), 110);
        assert_eq!(ag(&st).len(), 1);
        assert_eq!(ag(&st)[0].agent_id.as_deref(), Some("a1"));
        st.ingest_hook(&sub("SubagentStop", "a1", json!("engineer")), 150);
        assert_eq!((ag(&st)[0].state, ag(&st)[0].duration_ms), (NodeState::Done, Some(50)));
        let post = json!({"tool_response":{"status":"completed","agentId":"a1","totalTokens":5,"totalDurationMs":7}});
        st.ingest_hook(&ah("PostToolUse", "Agent", "t1", post), 200);
        let a = &ag(&st)[0];
        assert_eq!((ag(&st).len(), a.state, a.tokens, a.duration_ms), (1, NodeState::Done, Some(5), Some(7)));
        // 모르는 agent_id + 빈 agent_type → 무시
        let mut st = Store::default();
        st.ingest_hook(&sub("SubagentStop", "zz", json!("")), 1);
        st.ingest_hook(&sub("SubagentStart", "zz", json!("")), 1);
        assert_eq!(ag(&st).len(), 0);
        // 타입이 있으면 done 노드
        st.ingest_hook(&sub("SubagentStop", "zz", json!("Explore")), 1);
        assert_eq!((ag(&st).len(), ag(&st)[0].state), (1, NodeState::Done));
    }

    #[test]
    fn s_agent_merge_on_post() {
        let mut st = Store::default();
        st.ingest_hook(&sub("SubagentStart", "a2", json!("Explore")), 10);
        let inp = json!({"tool_input":{"subagent_type":"Plan"}});
        st.ingest_hook(&ah("PreToolUse", "Agent", "t2", inp), 20);
        assert_eq!(ag(&st).len(), 2);
        let post = json!({"tool_response":{"status":"completed","agentId":"a2"}});
        st.ingest_hook(&ah("PostToolUse", "Agent", "t2", post), 30);
        let a = &ag(&st)[0];
        assert_eq!(ag(&st).len(), 1);
        assert_eq!((a.tool_use_id.as_deref(), a.agent_id.as_deref(), a.started_ms), (Some("t2"), Some("a2"), Some(10)));
    }

    #[test]
    fn s2_merge_keeps_node_with_own_tool_use_id() {
        let mut st = Store::default();
        let inp = json!({"tool_input":{"subagent_type":"x","description":"d"}});
        st.ingest_hook(&ah("PreToolUse", "Agent", "t1", inp.clone()), 10);
        st.ingest_hook(&ah("PreToolUse", "Agent", "t2", inp), 11);
        st.ingest_hook(&sub("SubagentStart", "a1", json!("x")), 12);
        st.ingest_hook(&sub("SubagentStart", "a2", json!("x")), 13);
        // 엇갈린 짝: t2의 Post가 a1을 알린다. a1을 가진 t1은 아직 실행 중이다.
        let post = json!({"tool_response":{"status":"completed","agentId":"a1"}});
        st.ingest_hook(&ah("PostToolUse", "Agent", "t2", post), 30);
        assert_eq!(ag(&st).len(), 2);
        let t1 = ag(&st).iter().find(|a| a.tool_use_id.as_deref() == Some("t1")).unwrap();
        assert_eq!((t1.kind.as_deref(), t1.description.as_deref(), t1.state), (Some("x"), Some("d"), NodeState::Running));
    }

    #[test]
    fn t2_log_result_does_not_fix_duration_of_running_node() {
        let mut st = Store::default();
        st.ingest_hook(&ah("PreToolUse", "Agent", "t8", json!({})), 1);
        st.ingest_log(S, &alog("t8", "Agent", json!({}), "2000-03-01T00:00:00Z", false), 1);
        let post = json!({"tool_response":{"status":"async_launched"}});
        st.ingest_hook(&ah("PostToolUse", "Agent", "t8", post), 2);
        st.ingest_log(S, &rlog("t8", "2000-03-01T00:00:01Z", false), 1);
        assert_eq!((ag(&st)[0].state, ag(&st)[0].duration_ms), (NodeState::Running, None));
    }

    #[test]
    fn t_agent_fail_and_async() {
        let mut st = Store::default();
        st.ingest_hook(&ah("PostToolUseFailure", "Agent", "t3", json!({})), 1);
        assert_eq!(ag(&st)[0].state, NodeState::Failed);
        let post = json!({"tool_response":{"status":"async_launched"}});
        st.ingest_hook(&ah("PostToolUse", "Agent", "t4", post), 1);
        assert_eq!(ag(&st)[1].state, NodeState::Running);
    }

    #[test]
    fn u_agent_from_log() {
        let mut st = Store::default();
        st.ingest_log(S, &alog("t5", "Agent", json!({"subagent_type":"qa"}), "2000-03-01T00:00:00Z", false), 1);
        assert_eq!((ag(&st)[0].state, ag(&st)[0].kind.as_deref()), (NodeState::Unknown, Some("qa")));
        st.ingest_log(S, &rlog("t5", "2000-03-01T00:00:02Z", false), 1);
        assert_eq!((ag(&st)[0].state, ag(&st)[0].duration_ms), (NodeState::Done, Some(2000)));
        st.ingest_log(S, &alog("t6", "Task", json!({"description":"x"}), "2000-03-01T00:00:00Z", false), 1);
        assert_eq!((ag(&st)[1].kind.clone(), ag(&st)[1].description.as_deref()), (None, Some("x")));
        st.ingest_log(S, &rlog("t6", "2000-03-01T00:00:01Z", true), 1);
        assert_eq!(ag(&st)[1].state, NodeState::Failed);
        // Agent가 아닌 도구의 결과는 노드를 만들지 않는다
        st.ingest_log(S, &rlog("other", "2000-03-01T00:00:01Z", true), 1);
        assert_eq!(ag(&st).len(), 2);
    }

    #[test]
    fn v_hook_running_survives_log_result() {
        let mut st = Store::default();
        st.ingest_hook(&ah("PreToolUse", "Agent", "t7", json!({})), 1);
        st.ingest_log(S, &alog("t7", "Agent", json!({}), "2000-03-01T00:00:00Z", false), 1);
        st.ingest_log(S, &rlog("t7", "2000-03-01T00:00:01Z", false), 1);
        assert_eq!((ag(&st).len(), ag(&st)[0].state), (1, NodeState::Running));
        let post = json!({"tool_response":{"status":"completed"}});
        st.ingest_hook(&ah("PostToolUse", "Agent", "t7", post), 2);
        assert_eq!(ag(&st)[0].state, NodeState::Done);
    }

    #[test]
    fn w_no_grandchildren() {
        let mut st = Store::default();
        st.ingest_hook(&ah("PreToolUse", "Agent", "g1", json!({"agent_id":"a1"})), 1);
        st.ingest_log(S, &alog("g2", "Agent", json!({}), "2000-03-01T00:00:00Z", true), 1);
        assert_eq!(ag(&st).len(), 0);
    }

    #[test]
    fn x_agent_waiting() {
        let mut st = Store::default();
        st.ingest_hook(&sub("SubagentStart", "a1", json!("engineer")), 1);
        let mut p = h("PermissionRequest");
        p["agent_id"] = json!("a1");
        st.ingest_hook(&p, 2);
        assert_eq!(ag(&st)[0].state, NodeState::Waiting);
        let mut r = hook("PreToolUse", Some("r1"));
        r["agent_id"] = json!("a1");
        st.ingest_hook(&r, 3);
        assert_eq!(ag(&st)[0].state, NodeState::Running);
        let mut n = notif(json!("permission_prompt"));
        n["agent_id"] = json!("a1");
        st.ingest_hook(&n, 4);
        assert_eq!(ag(&st)[0].state, NodeState::Waiting);
    }

    #[test]
    fn y_agent_odd_shapes_cap_and_text() {
        let mut st = Store::default();
        st.ingest_hook(&ah("PreToolUse", "Agent", "o1", json!({"tool_input":"str"})), 1);
        st.ingest_hook(&ah("PostToolUse", "Agent", "o2", json!({"tool_response":5})), 1);
        st.ingest_hook(&ah("PostToolUse", "Agent", "o3", json!({"tool_response":{"agentId":{"a":1},"totalTokens":"x"}})), 1);
        st.ingest_hook(&sub("SubagentStart", "n1", json!(7)), 1);
        st.ingest_hook(&sub("SubagentStop", "n1", json!(7)), 1);
        assert_eq!(ag(&st).len(), 3);
        let mut st = Store::default();
        st.ingest_hook(&sub("SubagentStart", "x1", json!("<b>x</b>")), 1);
        assert_eq!(ag(&st)[0].kind.as_deref(), Some("<b>x</b>"));
        let mut st = Store::default();
        for i in 0..=MAX_AGENTS {
            st.ingest_hook(&ah("PreToolUse", "Agent", &format!("c{i}"), json!({})), 1);
        }
        assert_eq!(ag(&st).len(), MAX_AGENTS);
        assert_eq!(ag(&st)[0].tool_use_id.as_deref(), Some("c1"));
    }

    fn pre(st: &mut Store, id: &str) {
        st.ingest_hook(&ah("PreToolUse", "Agent", id, json!({})), 1);
    }
    fn post(st: &mut Store, id: &str) {
        st.ingest_hook(&ah("PostToolUse", "Agent", id, json!({"tool_response":{"status":"completed"}})), 1);
    }
    fn cols(st: &Store) -> Vec<u32> {
        ag(st).iter().map(|a| a.col).collect()
    }
    fn no_ts(mut v: Value) -> Value {
        v.as_object_mut().unwrap().remove("timestamp");
        v
    }
    const T0: &str = "2000-03-01T00:00:00Z";

    #[test]
    fn r_col_parallel_then_next() {
        let mut st = Store::default();
        for t in ["t1", "t2", "t3"] {
            pre(&mut st, t);
        }
        assert_eq!(cols(&st), [1, 1, 1]);
        post(&mut st, "t2");
        pre(&mut st, "t4");
        pre(&mut st, "t5");
        assert_eq!(cols(&st), [1, 1, 1, 2, 2]);
    }

    fn decisions13(st: &mut Store) {
        for t in ["a", "p"] {
            pre(st, t);
            post(st, t);
        }
        for t in ["e1", "e2", "e3"] {
            pre(st, t);
        }
        post(st, "e1");
        pre(st, "r");
    }

    #[test]
    fn r_col_decisions_example() {
        let mut st = Store::default();
        decisions13(&mut st);
        assert_eq!(cols(&st), [1, 2, 3, 3, 3, 4]);
    }

    #[test]
    fn r_col_is_immutable() {
        let mut st = Store::default();
        decisions13(&mut st);
        let key = |st: &Store| -> Vec<(Option<String>, u32)> { ag(st).iter().map(|a| (a.tool_use_id.clone(), a.col)).collect() };
        let before = key(&st);
        post(&mut st, "e2");
        post(&mut st, "e3");
        let e = json!({"tool_input":{"subagent_type":"engineer"}});
        st.ingest_hook(&ah("PreToolUse", "Agent", "e3", e), 1); // no-op re-Pre
        st.ingest_hook(&sub("SubagentStart", "z1", json!("engineer")), 1);
        st.ingest_hook(&sub("SubagentStop", "z1", json!("engineer")), 1);
        st.ingest_hook(&sub("SubagentStart", "z1", json!("engineer")), 1);
        let mut p = h("PermissionRequest");
        p["agent_id"] = json!("z1");
        st.ingest_hook(&p, 1);
        st.ingest_log(S, &alog("e1", "Agent", json!({}), T0, false), 1);
        st.ingest_log(S, &rlog("e1", T0, false), 1);
        st.ingest_log(S, &alog("n1", "Agent", json!({}), T0, false), 1);
        st.ingest_hook(&ah("PostToolUseFailure", "Agent", "f1", json!({})), 1);
        let after = key(&st);
        assert_eq!(&after[..before.len()], &before[..]);
        assert!(after[before.len()..].iter().all(|(_, c)| *c >= 4));
    }

    #[test]
    fn r_col_unfinished_stays_in_column() {
        let mut st = Store::default();
        st.ingest_hook(&sub("SubagentStart", "w1", json!("engineer")), 1);
        let mut p = h("PermissionRequest");
        p["agent_id"] = json!("w1");
        st.ingest_hook(&p, 1);
        assert_eq!(ag(&st)[0].state, NodeState::Waiting);
        pre(&mut st, "t2");
        assert_eq!(cols(&st), [1, 1]);
        let mut st = Store::default();
        st.ingest_log(S, &alog("u1", "Agent", json!({}), T0, false), 1);
        pre(&mut st, "t2");
        assert_eq!((ag(&st)[0].state, cols(&st)), (NodeState::Unknown, vec![1, 1]));
    }

    #[test]
    fn r_col_failure_counts_as_finished() {
        let mut st = Store::default();
        st.ingest_hook(&ah("PostToolUseFailure", "Agent", "t1", json!({})), 1);
        pre(&mut st, "t2");
        assert_eq!(cols(&st), [1, 2]);
        let mut st = Store::default();
        st.ingest_log(S, &alog("u1", "Agent", json!({}), T0, false), 1);
        st.ingest_log(S, &rlog("u1", T0, true), 1);
        st.ingest_log(S, &alog("u2", "Agent", json!({}), T0, false), 1);
        assert_eq!(cols(&st), [1, 2]);
    }

    #[test]
    fn r_col_log_restore() {
        for strip in [false, true] {
            let f = |v: Value| if strip { no_ts(v) } else { v };
            let mut st = Store::default();
            st.ingest_log(S, &f(alog("u1", "Agent", json!({}), "2000-03-01T00:00:00Z", false)), 1);
            st.ingest_log(S, &f(rlog("u1", "2000-03-01T00:00:02Z", false)), 1);
            st.ingest_log(S, &f(alog("u2", "Agent", json!({}), "2000-03-01T00:00:03Z", false)), 1);
            st.ingest_log(S, &f(alog("u3", "Agent", json!({}), "2000-03-01T00:00:04Z", false)), 1);
            assert_eq!(cols(&st), [1, 2, 2]);
        }
    }

    #[test]
    fn r_col_mixed_clocks_use_event_order() {
        let mut st = Store::default();
        st.ingest_hook(&ah("PreToolUse", "Agent", "t1", json!({})), 9_000_000_000_000);
        st.ingest_log(S, &alog("u2", "Agent", json!({}), T0, false), 1);
        assert_eq!(ag(&st)[0].tool_use_id.as_deref(), Some("t1"));
        assert_eq!(cols(&st), [1, 1]);
        post(&mut st, "t1");
        st.ingest_log(S, &alog("u3", "Agent", json!({}), T0, false), 1);
        assert_eq!(cols(&st), [1, 1, 2]);
    }

    #[test]
    fn r_col_born_finished() {
        let mut st = Store::default();
        st.ingest_hook(&sub("SubagentStop", "zz", json!("x")), 1);
        assert_eq!((ag(&st)[0].state, cols(&st)), (NodeState::Done, vec![1]));
        pre(&mut st, "t2");
        assert_eq!(cols(&st), [1, 2]);
    }

    #[test]
    fn r_col_merge_takes_min() {
        let mut st = Store::default();
        st.ingest_hook(&sub("SubagentStart", "a2", json!("Explore")), 1);
        pre(&mut st, "t9");
        post(&mut st, "t9");
        let inp = json!({"tool_input":{"subagent_type":"Plan"}});
        st.ingest_hook(&ah("PreToolUse", "Agent", "t2", inp), 1);
        assert_eq!(cols(&st), [1, 1, 2]);
        let p = json!({"tool_response":{"status":"completed","agentId":"a2"}});
        st.ingest_hook(&ah("PostToolUse", "Agent", "t2", p), 1);
        assert_eq!((ag(&st).len(), ag(&st)[1].tool_use_id.as_deref(), ag(&st)[1].col), (2, Some("t2"), 1));
    }

    #[test]
    fn r_col_eviction_keeps_cols() {
        let mut st = Store::default();
        for i in 0..=MAX_AGENTS {
            pre(&mut st, &format!("c{i}"));
        }
        assert_eq!(ag(&st).len(), MAX_AGENTS);
        assert!(cols(&st).iter().all(|c| *c == 1));
        post(&mut st, "c5");
        pre(&mut st, "next");
        assert_eq!(ag(&st).last().unwrap().col, 2);
    }

    #[test]
    fn r_col_json() {
        let mut st = Store::default();
        pre(&mut st, "t1");
        assert_eq!(serde_json::to_value(&ag(&st)[0]).unwrap()["col"], 1);
    }

    #[test]
    fn z_col_saturates() {
        let mut ag = vec![Agent { tool_use_id: None, agent_id: None, kind: None, description: None, state: NodeState::Done, started_ms: None, duration_ms: None, tokens: None, col: u32::MAX, run_gen: 0 }];
        let i = push_agent(&mut ag, None, None, NodeState::Running, None, 0);
        assert_eq!(ag[i].col, u32::MAX);
    }

    #[test]
    fn z_long_strings_capped() {
        let mut st = Store::default();
        let long = "a".repeat(300);
        assert!(st.ingest_hook(&json!({"hook_event_name":"Stop","session_id":long}), 1).is_none());
        let v = json!({"hook_event_name":"PreToolUse","session_id":S,"tool_use_id":long,"tool_name":"Read"});
        assert!(st.ingest_hook(&v, 1).is_some());
        assert_eq!(evs(&st).len(), 0);
        let v = json!({"hook_event_name":"UserPromptSubmit","session_id":"s2","cwd":"c".repeat(5000)});
        st.ingest_hook(&v, 1);
        assert_eq!(st.get("s2").unwrap().cwd, None);
        let v = json!({"hook_event_name":"PreToolUse","session_id":S,"tool_use_id":"t","tool_name":"Agent",
            "tool_input":{"description":"한".repeat(1000),"subagent_type":"가".repeat(1000)}});
        st.ingest_hook(&v, 1);
        let a = &st.get(S).unwrap().agents[0];
        assert_eq!(a.description.as_ref().unwrap().chars().count(), 256);
        assert_eq!(a.kind.as_ref().unwrap().chars().count(), 256);
    }

    #[test]
    fn z_log_and_hook_limits() {
        let long = "a".repeat(300);
        // 로그: id·uuid·tool_use_id 상한
        let mut st = Store::default();
        st.ingest_log(S, &use_line(&long, "Read"), 1);
        assert!(evs(&st).iter().all(|e| e.tool_use_id.is_none() && !e.key.contains("aaa")));
        let mut st = Store::default();
        let v = json!({"uuid":long,"message":{"content":[{"type":"tool_use","name":"Read"}]}});
        st.ingest_log(S, &v, 1);
        assert_eq!(st.get(S).unwrap().events.len(), 0);
        let mut st = Store::default();
        st.ingest_log(S, &res_line(&long), 1);
        assert_eq!(st.get(S).unwrap().events.len(), 0);
        let mut st = Store::default();
        let mut v = use_line("t", "Read");
        v["cwd"] = json!("c".repeat(5000));
        st.ingest_log(S, &v, 1);
        assert_eq!(st.get(S).unwrap().cwd, None);
        // 훅: agent_id·tool_response.agentId·tool_name
        let mut st = Store::default();
        st.ingest_hook(&sub("SubagentStart", &long, json!("t")), 1);
        assert_eq!(ag(&st).len(), 0);
        st.ingest_hook(&ah("PreToolUse", "Agent", "t1", json!({})), 1);
        st.ingest_hook(&ah("PostToolUse", "Agent", "t1", json!({"tool_response":{"status":"completed","agentId":long}})), 1);
        assert_eq!(ag(&st)[0].agent_id, None);
        assert_eq!(ag(&st)[0].state, NodeState::Done);
        st.ingest_hook(&ah("PreToolUse", &"한".repeat(1000), "t2", json!({})), 1);
        assert_eq!(evs(&st).last().unwrap().tool.chars().count(), 256);
    }

    // ---- run마다 새 그래프 ----
    fn wh(tuid: &str, tool: &str, val: &str) -> Value {
        let k = if tool == "Edit" { "new_string" } else { "content" };
        ah("PreToolUse", tool, tuid, json!({"tool_input":{"file_path":"/w/p/.orbit/current",k:val}}))
    }
    fn wl(tuid: &str, tool: &str, val: &str) -> Value {
        let k = if tool == "Edit" { "new_string" } else { "content" };
        alog(tuid, tool, json!({"file_path":"/w/p/.orbit/current",k:val}), "2000-03-01T00:00:00Z", false)
    }
    fn shown(st: &Store) -> Vec<String> {
        snapshot(st.get(S).unwrap(), 0).agents.iter().filter_map(|a| a.tool_use_id.clone()).collect()
    }
    fn s_(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn run_start_cases() {
        let c = "/w/p/.orbit/current";
        let w = |p: &str, v: Value| run_start(Some("Write"), Some(&json!({"file_path":p,"content":v})));
        assert_eq!(w(c, json!("r1\n")), Some("r1".into()));
        assert_eq!(w(".orbit/current", json!("r1")), Some("r1".into()));
        assert_eq!(w("C:\\w\\.orbit\\current", json!("r1")), Some("r1".into()));
        let e = |p: &str, v: Value| run_start(Some("Edit"), Some(&json!({"file_path":p,"new_string":v})));
        assert_eq!(e(c, json!("r2\n")), Some("r2".into()));
        assert_eq!(e(c, json!("../x")), None);
        assert_eq!(e("/w/p/src/a.rs", json!("r2")), None);
        assert_eq!(e(c, json!(5)), None);
        assert_eq!(run_start(Some("Edit"), Some(&json!({"file_path":c}))), None);
        assert_eq!(run_start(Some("Write"), Some(&json!({"file_path":c,"new_string":"r1"}))), None);
        assert_eq!(run_start(Some("Bash"), Some(&json!({"file_path":c,"content":"r1"}))), None);
        assert_eq!(run_start(Some("Read"), Some(&json!({"file_path":c,"content":"r1"}))), None);
        for p in ["/w/foo.orbit/current", "/w/.orbit/current.bak", "/w/.orbit/runs/x"] {
            assert_eq!(w(p, json!("r1")), None, "{p}");
        }
        for v in [json!("../x"), json!("a b"), json!(".hidden"), json!(""), json!("a".repeat(129)), json!(7)] {
            assert_eq!(w(c, v.clone()), None, "{v}");
        }
        assert_eq!(w(c, json!("a".repeat(128))).map(|s| s.len()), Some(128));
        assert_eq!(run_start(Some("Write"), Some(&json!({"file_path":c}))), None);
        assert_eq!(run_start(Some("Write"), None), None);
        assert_eq!(run_start(Some("Write"), Some(&json!({"file_path":3,"content":"r1"}))), None);
    }

    #[test]
    fn run_hook_order_hides_old_nodes() {
        let mut st = Store::default();
        st.ingest_hook(&ah("PreToolUse", "Agent", "t1", json!({})), 1);
        st.ingest_hook(&wh("w1", "Write", "r1"), 2);
        st.ingest_hook(&ah("PreToolUse", "Agent", "t2", json!({})), 3);
        st.ingest_hook(&ah("PreToolUse", "Agent", "t3", json!({})), 4);
        assert_eq!(shown(&st), s_(&["t2", "t3"]));
        assert_eq!(st.get(S).unwrap().run.as_deref(), Some("r1"));
        assert_eq!(st.get(S).unwrap().agents.len(), 3);
        // 같은 id를 훅으로 다시, 이어서 같은 호출의 로그 줄
        st.ingest_hook(&wh("w2", "Write", "r1"), 5);
        st.ingest_log(S, &wl("w1", "Write", "r1"), 6);
        assert_eq!(shown(&st), s_(&["t2", "t3"]));
        // 새 id
        st.ingest_hook(&wh("w3", "Write", "r2"), 7);
        assert!(shown(&st).is_empty());
        st.ingest_hook(&h("UserPromptSubmit"), 8);
        st.ingest_hook(&ah("PreToolUse", "Read", "rd", json!({})), 9);
        st.ingest_hook(&h("Stop"), 10);
        assert!(shown(&st).is_empty());
        st.ingest_hook(&ah("PreToolUse", "Agent", "t4", json!({})), 11);
        assert_eq!(shown(&st), s_(&["t4"]));
        assert_eq!(st.get(S).unwrap().run.as_deref(), Some("r2"));
    }

    #[test]
    fn run_log_path_and_same_message() {
        let mut st = Store::default();
        st.ingest_log(S, &alog("u1", "Agent", json!({}), "2000-03-01T00:00:00Z", false), 1);
        st.ingest_log(S, &wl("w1", "Write", "r1"), 1);
        st.ingest_log(S, &alog("u2", "Agent", json!({}), "2000-03-01T00:00:01Z", false), 1);
        assert_eq!(shown(&st), s_(&["u2"]));
        let both = json!({"timestamp":"2000-03-01T00:00:02Z","message":{"content":[
            {"type":"tool_use","id":"w9","name":"Write","input":{"file_path":".orbit/current","content":"r9"}},
            {"type":"tool_use","id":"u3","name":"Agent","input":{}}]}});
        st.ingest_log(S, &both, 1);
        assert_eq!(shown(&st), s_(&["u3"]));
    }

    #[test]
    fn run_ignores_agent_and_sidechain() {
        let mut st = Store::default();
        st.ingest_hook(&ah("PreToolUse", "Agent", "t1", json!({})), 1);
        let mut v = wh("w1", "Write", "r1");
        v["agent_id"] = json!("a1");
        st.ingest_hook(&v, 2);
        let side = alog("w2", "Write", json!({"file_path":".orbit/current","content":"r2"}), "2000-03-01T00:00:00Z", true);
        st.ingest_log(S, &side, 3);
        assert_eq!(st.get(S).unwrap().run, None);
        assert_eq!(shown(&st), s_(&["t1"]));
    }

    #[test]
    fn run_subagent_start_does_not_pair_with_old_run() {
        let mut st = Store::default();
        st.ingest_hook(&ah("PreToolUse", "Agent", "t1", json!({"tool_input":{"subagent_type":"x"}})), 1);
        st.ingest_hook(&wh("w1", "Write", "r2"), 2);
        st.ingest_hook(&sub("SubagentStart", "a1", json!("x")), 3);
        let a = &st.get(S).unwrap().agents;
        assert_eq!(a.len(), 2);
        assert_eq!(a[0].agent_id, None);
        assert_eq!(a[1].agent_id.as_deref(), Some("a1"));
        assert_eq!(a[1].run_gen, 1);
    }

    #[test]
    fn run_duplicate_late_log_does_not_revert() {
        let mut st = Store::default();
        st.ingest_hook(&wh("w1", "Write", "r1"), 1);
        st.ingest_hook(&wh("w2", "Write", "r2"), 2);
        st.ingest_hook(&ah("PreToolUse", "Agent", "t5", json!({})), 3);
        st.ingest_log(S, &wl("w1", "Write", "r1"), 4);
        assert_eq!(st.get(S).unwrap().run.as_deref(), Some("r2"));
        assert_eq!(shown(&st), s_(&["t5"]));
        let no_id = json!({"timestamp":"2000-03-01T00:00:05Z","message":{"content":[
            {"type":"tool_use","name":"Write","input":{"file_path":".orbit/current","content":"r3"}}]}});
        st.ingest_log(S, &no_id, 5);
        assert_eq!(st.get(S).unwrap().run.as_deref(), Some("r3"));
    }

    #[test]
    fn run_edit_paths() {
        let mut st = Store::default();
        st.ingest_hook(&ah("PreToolUse", "Agent", "t1", json!({})), 1);
        st.ingest_hook(&wh("e1", "Edit", "r1"), 2);
        assert_eq!(st.get(S).unwrap().run.as_deref(), Some("r1"));
        assert!(shown(&st).is_empty());
        st.ingest_log(S, &wl("e2", "Edit", "r2"), 3);
        assert_eq!(st.get(S).unwrap().run.as_deref(), Some("r2"));
    }

    #[test]
    fn run_serializes_only_run() {
        let mut st = Store::default();
        st.ingest_hook(&wh("w1", "Write", "r1"), 1);
        let j = serde_json::to_value(snapshot(st.get(S).unwrap(), 0)).unwrap();
        assert_eq!(j["run"], json!("r1"));
        assert!(j.get("run_gen").is_none());
    }
}
