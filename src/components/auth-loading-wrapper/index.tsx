import React from 'react';

type AuthLoadingWrapperProps = {
    children: React.ReactNode;
};

// NOTE: Previously this component blocked rendering with a fullscreen loader
// while OAuth single-sign-on was in progress. In real-world deployments
// (custom domains, blocked third-party cookies, CSP, the `logged_state`
// cookie being set without a corresponding accountsList) that SSO round-trip
// frequently never completes — leaving the user stuck on a fullscreen
// spinner forever. Even with timeouts the underlying state could flicker
// and reset the timer.
//
// The app already renders a "Log in" button and supports manual auth, so
// blocking the entire UI on background SSO is never acceptable. We now
// render children unconditionally and let any auth-required surface decide
// for itself how to react.
const AuthLoadingWrapper = ({ children }: AuthLoadingWrapperProps) => {
    return <>{children}</>;
};

export default AuthLoadingWrapper;
