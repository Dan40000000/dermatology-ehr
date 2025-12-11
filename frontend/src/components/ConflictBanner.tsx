interface ConflictBannerProps {
  message?: string | null;
}

export function ConflictBanner({ message }: ConflictBannerProps) {
  if (!message) return null;
  return (
    <div className="banner error">
      {message}
    </div>
  );
}
