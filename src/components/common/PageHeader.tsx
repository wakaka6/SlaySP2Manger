import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function PageHeader(props: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-header__title">{props.title}</h1>
        <p className="page-header__description">{props.description}</p>
      </div>
      {props.action ? <div>{props.action}</div> : null}
    </div>
  );
}
