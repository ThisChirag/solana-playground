import React, { Component, ErrorInfo, ReactNode } from 'react';
import styled from 'styled-components';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ChatErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Chat error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <ErrorContainer>
          <h3>Something went wrong with the chat</h3>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </ErrorContainer>
      );
    }

    return this.props.children;
  }
}

const ErrorContainer = styled.div`
  padding: 1rem;
  color: ${({ theme }) => theme.colors.default.textPrimary};
  background: ${({ theme }) => theme.colors.state.error.bg};
  border: 1px solid ${({ theme }) => theme.colors.default.border};
  border-radius: 4px;
  margin: 1rem;
`; 