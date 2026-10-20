import { useEffect, useState } from "react";

/**
 * Prosty routing na hashu (#/trening/ID). Przycisk „wstecz” w Androidzie działa,
 * a serwer nie musi znać ścieżek.
 */
export type Route =
  | { name: "today" }
  | { name: "workout"; id: string }
  | { name: "summary"; id: string }
  | { name: "history" }
  | { name: "progress" }
  | { name: "exercise"; id: string }
  | { name: "me" };

export function parse(hash: string): Route {
  const [, a, b] = hash.replace(/^#/, "").split("/");
  switch (a) {
    case "trening":
      return b ? { name: "workout", id: b } : { name: "history" };
    case "postep":
      return b ? { name: "exercise", id: b } : { name: "progress" };
    case "podsumowanie":
      return b ? { name: "summary", id: b } : { name: "history" };
    case "ja":
      return { name: "me" };
    default:
      return { name: "today" };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case "workout":
      return `#/trening/${route.id}`;
    case "summary":
      return `#/podsumowanie/${route.id}`;
    case "history":
      return "#/trening";
    case "exercise":
      return `#/postep/${route.id}`;
    case "progress":
      return "#/postep";
    case "me":
      return "#/ja";
    default:
      return "#/";
  }
}

export function go(route: Route, replace = false) {
  if (replace) location.replace(href(route));
  else location.hash = href(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
