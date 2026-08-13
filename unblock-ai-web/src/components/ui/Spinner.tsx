// The amber ring used in both portals
export function Spinner({ size = 34 }: { size?: number }) {
  return (
    <div
      className="animate-ubspin flex-none rounded-full border-[2.5px] border-warn-border border-t-warn"
      style={{ width: size, height: size }}
      role="status"
      aria-label="In progress"
    />
  );
}
