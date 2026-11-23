import { useEffect } from 'react';

const DEFAULT_TITLE = 'Plinth';

/** Sets the browser tab's title while a page is showing, and puts it back when it leaves. */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title === null) return;
    document.title = title;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}
