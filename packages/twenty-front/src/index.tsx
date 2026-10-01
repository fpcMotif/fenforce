import ReactDOM from 'react-dom/client';

import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import 'react-loading-skeleton/dist/skeleton.css';
import 'twenty-ui/style.css';
import 'twenty-ui/theme-light.css';
import 'twenty-ui/theme-dark.css';
import './index.css';

const root = ReactDOM.createRoot(
  document.getElementById('root') ?? document.body,
);

if (import.meta.env.REACT_APP_FENFORCE_CONVEX_URL) {
  import('./pages/convex-preview/ConvexCompaniesPreview').then(
    ({ ConvexCompaniesPreview }) => root.render(<ConvexCompaniesPreview />),
  );
} else {
  Promise.all([
    import('@/app/components/App'),
    import('@/app/utils/setupMonacoEnvironment'),
    import('@/metadata-store/storage/metadataStoreStorage'),
  ]).then(([{ App }, , { hydrateMetadataStore }]) => {
    hydrateMetadataStore().then(
      () => root.render(<App />),
      () => root.render(<App />),
    );
  });
}
