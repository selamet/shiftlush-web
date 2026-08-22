/**
 * What a render error leaves on the screen.
 *
 * Until this existed it left nothing: React unmounts the whole tree when an
 * error reaches the top with no boundary below it, so a single bad property
 * access on one card blanked the entire window. The user got a white page with
 * no sentence, no reference and no way back, and nobody else got anything at
 * all — which is the second half of the same problem, because a boundary is
 * what turns a blank screen into a report.
 *
 * There are two of these, at two heights, and the difference matters:
 *
 *   - `ScreenBoundary` sits inside the application shell, around the outlet. A
 *     screen that throws is replaced by this and *nothing else is* — the
 *     sidebar, the topbar and every link in them are still there, so the person
 *     can go somewhere that works instead of reaching for the back button. It
 *     is keyed on the path, so walking away from the broken screen genuinely
 *     leaves it behind: a boundary that keeps its error state across a
 *     navigation shows the failure of the previous screen on the next one.
 *
 *   - The boundary in `main.tsx` wraps everything, including the router. It
 *     catches what the first one cannot: the shell itself, the providers above
 *     it, the public screens that have no shell, and the router's own
 *     machinery. There is no navigation left to preserve at that height, so its
 *     answer is the honest one — reload.
 *
 * Neither fallback uses router context or query context, because at the height
 * of the outer one there may not be any. `window.location` is the way out from
 * both, which is also what `session.tsx` does when a session ends underneath
 * somebody.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorReference, reportError } from "@/lib/observability";

type Where = "screen" | "root";

interface Props {
  children: ReactNode;
  where: Where;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // React 19 hands a caught error to `console.error` and stops there, so
    // without this line the boundary would make the screen better and the
    // silence worse: a failure that used to be a visible white page would
    // become a tidy apology nobody ever hears about.
    reportError(error, {
      boundary: this.props.where,
      componentStack: info.componentStack ?? undefined,
    });
  }

  private readonly retry = (): void => this.setState({ error: null });

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return <CrashScreen error={this.state.error} where={this.props.where} onRetry={this.retry} />;
  }
}

/**
 * The screen-level boundary, remounted on every navigation.
 *
 * `key` rather than a `componentDidUpdate` comparison: remounting is what
 * clears the state, and expressing it as a key means the reset cannot be
 * forgotten in a branch.
 */
export function ScreenBoundary({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <ErrorBoundary key={pathname} where="screen">
      {children}
    </ErrorBoundary>
  );
}

function CrashScreen({
  error,
  where,
  onRetry,
}: {
  error: Error;
  where: Where;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const reference = errorReference(error);

  return (
    <div
      role="alert"
      // Read by scripts/smoke-render.mjs, which fails if this ever renders
      // during the render check. A screen that throws must show up there as a
      // failure, not as a tidily handled apology.
      data-error-boundary={where}
      className="flex flex-col items-center gap-4 px-6 py-16 text-center"
    >
      <AlertTriangle className="size-8 text-danger" aria-hidden="true" />
      <div className="flex flex-col gap-2">
        <p className="text-cardtitle">{t("crash.title")}</p>
        <p className="max-w-md text-body text-muted-foreground">{t("crash.body")}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {where === "screen" ? (
          <>
            <Button size="lg" onClick={onRetry}>
              {t("common.retry")}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              // A full navigation rather than a router one: the router is above
              // this boundary and may be part of what went wrong.
              onClick={() => window.location.assign("/")}
            >
              {t("crash.goHome")}
            </Button>
          </>
        ) : (
          <Button size="lg" onClick={() => window.location.reload()}>
            {t("crash.reload")}
          </Button>
        )}
      </div>

      {/* The same number the support line asks for, and the same one the
          backend tags its own report with. */}
      {reference && (
        <p className="text-help text-subtle">
          {t("errors.requestIdLabel")}: <span className="font-mono">{reference}</span>
        </p>
      )}
    </div>
  );
}
