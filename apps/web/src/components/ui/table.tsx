import { cn } from "../../lib/utils";

export function Table({
  className,
  containerClassName,
  ...props
}: React.HTMLAttributes<HTMLTableElement> & { containerClassName?: string }) {
  // The wrapper is the scroll container. Pass `containerClassName` (e.g.
  // "min-h-0 flex-1") to make it a bounded, vertically-scrolling region so a
  // `sticky` TableHeader can pin to it.
  return (
    <div className={cn("w-full overflow-auto", containerClassName)}>
      <table
        className={cn(
          // Separate border model (not the default collapse) so cell borders
          // belong to the cells and stay painted with a `sticky` header when
          // the body scrolls underneath.
          "w-full caption-bottom border-separate border-spacing-0 text-sm",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  // The header's bottom divider lives on the cells (TableHead) as an inset
  // shadow rather than on the row, so it stays put when the header is sticky
  // and the body scrolls underneath.
  return <thead className={cn(className)} {...props} />;
}

export function TableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn("[&_tr:last-child_td]:border-b-0", className)}
      {...props}
    />
  );
}

export function TableRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "transition-colors hover:bg-muted/50",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-10 border-b border-border px-4 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("border-b border-border p-4 align-middle", className)}
      {...props}
    />
  );
}
