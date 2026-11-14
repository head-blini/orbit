// 사이드카 순수 로직: SDK import 없음. 프로토콜은 PLAN.md "프로토콜" 절.

export function parseLine(line) {
  try {
    const v = JSON.parse(line);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export function redact(s) {
  return String(s)
    .replace(/sk-ant-[\w-]+/g, "[가림]")
    .replace(/Bearer\s+\S+/g, "[가림]")
    .replace(/[A-Za-z0-9_\-.]{40,}/g, "[가림]");
}

const FIELD = { Bash: "command", Edit: "file_path", Write: "file_path", Read: "file_path", WebFetch: "url" };

export function target(tool, input) {
  const i = input && typeof input === "object" ? input : {};
  const v = tool === "NotebookEdit" ? (i.notebook_path ?? i.file_path) : i[FIELD[tool]];
  if (typeof v === "string") return v;
  const j = JSON.stringify(input) ?? "";
  return j.length > 300 ? j.slice(0, 300) + "…" : j;
}

export function fromSdk(msg, st) {
  if (!msg || typeof msg !== "object") return [];
  if (msg.type === "stream_event") {
    const d = msg.event?.type === "content_block_delta" ? msg.event.delta : null;
    if (d?.type === "text_delta" && msg.parent_tool_use_id == null && !st.interrupting && typeof d.text === "string") {
      return [{ t: "delta", text: d.text }];
    }
    return [];
  }
  if (msg.type === "system" && msg.subtype === "init") return [{ t: "session", id: String(msg.session_id) }];
  if (msg.type === "result") {
    st.turns = Math.max(0, (st.turns | 0) - 1);
    if (st.interrupting) {
      st.interrupting = false;
      return [{ t: "stopped" }];
    }
    if (msg.subtype === "success" && !msg.is_error) return [{ t: "done", cost: msg.total_cost_usd ?? null }];
    const why = typeof msg.result === "string" && msg.result ? msg.result : String(msg.subtype ?? "error");
    return [{ t: "error", message: redact(why) }];
  }
  return [];
}

// 실행 중인 턴(st.turns > 0)이 있을 때만 중단 플래그를 켠다. 아니면 다음 턴이 잘못 중단된다.
export function markInterrupt(st) {
  if (st.turns > 0) st.interrupting = true;
}

const str = (v) => String(v ?? "");

export function createPermits(emit) {
  const pending = new Map(); // id -> {kind, input, key, resolve}
  const rules = new Set();
  let n = 0;

  const close = (id, reason) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    p.resolve({ behavior: "deny", message: reason });
    emit({ t: "closed", id });
  };

  function canUseTool(tool, input, opts) {
    const ask = tool === "AskUserQuestion";
    const key = ask ? null : tool === "Bash" ? (typeof input?.command === "string" ? "Bash\n" + input.command : null) : tool;
    if (key && rules.has(key)) return Promise.resolve({ behavior: "allow", updatedInput: input });
    const id = "p" + ++n;
    return new Promise((resolve) => {
      pending.set(id, { kind: ask ? "ask" : "permit", input, key, resolve, tool });
      if (ask) {
        const questions = (Array.isArray(input?.questions) ? input.questions : []).map((q) => ({
          question: str(q?.question),
          header: str(q?.header),
          multiSelect: Boolean(q?.multiSelect),
          options: (Array.isArray(q?.options) ? q.options : []).map((o) => ({ label: str(o?.label), description: str(o?.description) })),
        }));
        emit({ t: "ask", id, questions });
      } else {
        emit({ t: "permit", id, tool, target: target(tool, input) });
      }
      const sig = opts?.signal;
      if (sig?.aborted) close(id, "취소됨");
      else sig?.addEventListener("abort", () => close(id, "취소됨"), { once: true });
    });
  }

  function permit(id, decision) {
    const p = pending.get(id);
    if (!p || p.kind !== "permit") return;
    if (decision === "allow" || decision === "session") {
      if (decision === "session" && p.key) rules.add(p.key);
      pending.delete(id);
      p.resolve({ behavior: "allow", updatedInput: p.input });
    } else if (decision === "deny") {
      pending.delete(id);
      p.resolve({ behavior: "deny", message: "사용자가 거부했습니다" });
    }
  }

  function answer(id, answers) {
    const p = pending.get(id);
    if (!p || p.kind !== "ask") return;
    const clean = {};
    for (const [k, v] of Object.entries(answers && typeof answers === "object" ? answers : {})) {
      if (typeof v === "string") clean[k] = v;
    }
    pending.delete(id);
    p.resolve({ behavior: "allow", updatedInput: { questions: p.input.questions, answers: clean } });
  }

  function denyAll(reason) {
    for (const id of [...pending.keys()]) close(id, reason || "중단됨");
  }

  return { canUseTool, permit, answer, denyAll };
}
