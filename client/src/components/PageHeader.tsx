import React from 'react';

interface PageHeaderProps {
  readonly title: string;
  /** For a section that names itself by this heading. */
  readonly titleId?: string;
  /** Links or actions shown on the right of the row. */
  readonly children?: React.ReactNode;
}

/** The row under the site header that names the page, the same on every page. */
export function PageHeader({ title, titleId, children }: PageHeaderProps): React.ReactElement {
  return (
    <div className="page-header">
      <h2 id={titleId} className="page-title">
        {title}
      </h2>
      {children}
    </div>
  );
}
