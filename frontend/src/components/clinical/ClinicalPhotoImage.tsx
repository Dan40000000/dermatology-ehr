import { CSSProperties, useEffect, useState } from 'react';

interface ClinicalPhotoImageProps {
  src: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  style?: CSSProperties;
}

export function ClinicalPhotoImage({
  src,
  alt,
  className,
  loading = 'lazy',
  style,
}: ClinicalPhotoImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed || !src) {
    return (
      <div className={`photo-image-fallback ${className || ''}`} role="img" aria-label={`${alt} unavailable`} style={style}>
        <div className="photo-image-fallback-icon">Photo</div>
        <div>
          <strong>Photo file unavailable</strong>
          <span>Record exists, but the image file is not on this server.</span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
