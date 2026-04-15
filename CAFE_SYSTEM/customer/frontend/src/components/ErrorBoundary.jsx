import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Unhandled app error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{ padding: 32, maxWidth: 720, margin: "0 auto" }}>
          <h1>Something went wrong</h1>
          <p style={{ color: "#a11" }}>{error?.message || "An unexpected error occurred."}</p>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button type="button" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button type="button" onClick={this.handleReset}>
              Dismiss
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

