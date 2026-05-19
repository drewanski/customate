import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import { CartProvider } from "./hooks/useCart";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary
      onError={(err, info) => {
        // In production, forward to your error tracking service here
        // e.g. Sentry.captureException(err, { extra: info });
        if (import.meta.env.PROD) {
          // Best-effort beacon — silent if endpoint missing
          try {
            const payload = JSON.stringify({
              message: err.message,
              stack: err.stack,
              componentStack: info?.componentStack,
              url: typeof window !== 'undefined' ? window.location.href : '',
              ts: new Date().toISOString(),
            });
            navigator.sendBeacon?.('/api/client-errors', payload);
          } catch {
            /* swallow */
          }
        }
      }}
    >
      <CartProvider>
        <RouterProvider router={router} />
      </CartProvider>
    </ErrorBoundary>
  );
}
