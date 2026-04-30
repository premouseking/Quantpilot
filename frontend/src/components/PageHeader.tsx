import React from "react";

interface Props {
  title: string;
  subtitle?: React.ReactNode;
  extra?: React.ReactNode;
  badge?: React.ReactNode;
}

export const PageHeader: React.FC<Props> = ({ title, subtitle, extra, badge }) => (
  <div className="qp-page__header">
    <div>
      <h1 className="qp-page__title">
        {title}
        {badge && <span style={{ marginLeft: 12 }}>{badge}</span>}
      </h1>
      {subtitle && <p className="qp-page__subtitle">{subtitle}</p>}
    </div>
    {extra && <div>{extra}</div>}
  </div>
);
