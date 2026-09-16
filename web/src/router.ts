/**
 * Roteador mínimo baseado em hash — sem dependência de biblioteca de roteamento,
 * coerente com a decisão de não fixar framework de UI (T001, `roadmap.md`).
 */

type RouteHandler = (params: Record<string, string>) => void | Promise<void>;

interface Route {
  segments: string[];
  handler: RouteHandler;
}

const routes: Route[] = [];
let notFoundHandler: RouteHandler = () => {
  document.getElementById("app")!.innerHTML = "<p>Página não encontrada.</p>";
};

export function addRoute(path: string, handler: RouteHandler): void {
  routes.push({ segments: path.split("/").filter(Boolean), handler });
}

export function setNotFound(handler: RouteHandler): void {
  notFoundHandler = handler;
}

function matchRoute(pathSegments: string[]): { handler: RouteHandler; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.segments.length !== pathSegments.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < route.segments.length; i++) {
      const routeSeg = route.segments[i]!;
      const pathSeg = pathSegments[i]!;
      if (routeSeg.startsWith(":")) {
        params[routeSeg.slice(1)] = decodeURIComponent(pathSeg);
      } else if (routeSeg !== pathSeg) {
        matched = false;
        break;
      }
    }
    if (matched) return { handler: route.handler, params };
  }
  return null;
}

async function resolve(): Promise<void> {
  const hash = location.hash.replace(/^#/, "") || "/profiles";
  const segments = hash.split("/").filter(Boolean);
  const match = matchRoute(segments);
  if (match) {
    await match.handler(match.params);
  } else {
    await notFoundHandler({});
  }
}

export function navigate(path: string): void {
  location.hash = path;
}

export function startRouter(): void {
  window.addEventListener("hashchange", () => {
    void resolve();
  });
  void resolve();
}
