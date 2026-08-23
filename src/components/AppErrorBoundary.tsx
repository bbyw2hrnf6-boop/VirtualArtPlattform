import { Component, type ErrorInfo, type ReactNode } from 'react';

type AppErrorBoundaryProps = { children: ReactNode };
type AppErrorBoundaryState = { error: Error | null };

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('LIEUVA could not render the current view.', error, info);
  }

  private returnHome = () => {
    if (location.hash === '' || location.hash === '#/' || location.hash === '#') {
      location.reload();
      return;
    }
    location.hash = '/';
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return <main className="app-crash" role="alert" aria-labelledby="app-crash-title">
      <div>
        <p className="eyebrow">LIEUVA · Recovery</p>
        <h1 id="app-crash-title">This view could not be opened.</h1>
        <p>Your Project data has not been changed. Reload the page to try again, or return to the homepage.</p>
        <div className="app-crash-actions">
          <button className="button button--light" onClick={() => location.reload()}>Try again</button>
          <button className="text-link" onClick={this.returnHome}>Return home</button>
        </div>
      </div>
    </main>;
  }
}
