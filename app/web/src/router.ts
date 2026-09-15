import { useEffect, useState } from "react";

/** 最小のパスルーター。history API と popstate だけ */
export function nav(path: string, replace = false): void {
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  return path;
}

export type Route =
  | { name: "home" }
  | { name: "me" }
  | { name: "settings" }
  | { name: "predict"; theme: string }
  | { name: "plan"; theme: string }
  | { name: "rejected"; theme: string }
  | { name: "setup"; theme: string; cond: "A" | "B" }
  | { name: "measure"; theme: string; cond: "A" | "B" }
  | { name: "hold"; theme: string }
  | { name: "result"; theme: string }
  | { name: "chat"; theme: string }
  | { name: "record"; id: string }
  | { name: "halted" }
  | { name: "teacher" }
  | { name: "gallery" };

export function matchRoute(path: string): Route {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/") return { name: "home" };
  if (p === "/me") return { name: "me" };
  if (p === "/settings") return { name: "settings" };
  if (p === "/halted") return { name: "halted" };
  if (p === "/gallery") return { name: "gallery" };
  if (p.startsWith("/teacher")) return { name: "teacher" };
  let m = p.match(/^\/records\/([^/]+)$/);
  if (m) return { name: "record", id: m[1] };
  m = p.match(/^\/x\/([^/]+)$/);
  if (m) return { name: "predict", theme: m[1] };
  m = p.match(/^\/x\/([^/]+)\/(plan|rejected|hold|result|chat)$/);
  if (m) return { name: m[2] as "plan" | "rejected" | "hold" | "result" | "chat", theme: m[1] };
  m = p.match(/^\/x\/([^/]+)\/(setup|measure)\/(A|B)$/);
  if (m) return { name: m[2] as "setup" | "measure", theme: m[1], cond: m[3] as "A" | "B" };
  return { name: "home" };
}
