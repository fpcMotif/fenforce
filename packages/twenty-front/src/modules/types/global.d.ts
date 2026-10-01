import { type ComponentInstanceStateContext } from '@/ui/utilities/state/component-state/types/ComponentInstanceStateContext';
import { type JSX as ReactJSX } from 'react';

declare module 'react-router' {
  interface NavigateOptions {
    surface?: 'main';
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements extends ReactJSX.IntrinsicElements {}
  }

  interface Window {
    _env_?: Record<string, string>;
    __APOLLO_CLIENT__?: any;
    grecaptcha?: any;
    turnstile?: any;
    componentComponentStateContextMap: Map<
      string,
      ComponentInstanceStateContext<any>
    >;
    FrontChat?: (method: string, ...args: any[]) => void;
  }
}
