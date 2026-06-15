import * as React from "react";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-[18px] flex flex-wrap items-end justify-between gap-3.5">
      <div>
        <h1 className="m-0 flex items-center gap-2.5 text-[22px] font-extrabold tracking-[-0.02em]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-[760px] text-[13px] text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-2.5">{children}</div>
      ) : null}
    </div>
  );
}
