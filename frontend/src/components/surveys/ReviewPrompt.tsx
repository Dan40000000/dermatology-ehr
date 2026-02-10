/**
 * ReviewPrompt Component
 * Prompts satisfied patients (NPS 9-10) to leave online reviews
 */

interface ReviewPromptProps {
  reviewUrls: Record<string, string>;
  onClose: () => void;
  onReviewClick?: (platform: string) => void;
}

interface ReviewPlatform {
  id: string;
  name: string;
  icon: JSX.Element;
  color: string;
  bgColor: string;
}

const platforms: Record<string, ReviewPlatform> = {
  google: {
    id: 'google',
    name: 'Google',
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
    color: '#4285F4',
    bgColor: '#EEF6FF',
  },
  healthgrades: {
    id: 'healthgrades',
    name: 'Healthgrades',
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#00A9CE">
        <path d="M12 2L4 6v12l8 4 8-4V6l-8-4zm0 2.18L18 7.5v9l-6 3-6-3v-9l6-3.32z"/>
        <path d="M12 7a3 3 0 100 6 3 3 0 000-6zm0 2a1 1 0 110 2 1 1 0 010-2z"/>
        <path d="M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0 2c2.03 0 4.82.67 5.73 1.5H6.27c.91-.83 3.7-1.5 5.73-1.5z"/>
      </svg>
    ),
    color: '#00A9CE',
    bgColor: '#E6F8FB',
  },
  yelp: {
    id: 'yelp',
    name: 'Yelp',
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#D32323">
        <path d="M12.29 17.19c-.38-.31-.91-.24-1.18.17-.27.4-.17.95.23 1.23l3.03 2.08c.2.14.44.19.67.14.23-.05.43-.18.56-.37.13-.19.18-.42.14-.65-.04-.23-.16-.43-.34-.56l-3.11-2.04zM10.58 13.31l-4.37.97c-.44.1-.77.44-.84.89-.07.45.13.9.52 1.15l3.26 2.14c.21.14.46.18.7.12.24-.06.44-.21.56-.42.12-.21.16-.46.09-.7-.07-.24-.22-.44-.44-.56l-2.58-1.66 2.38-.53c.44-.1.78-.44.86-.89.08-.45-.12-.9-.5-1.16-.38-.26-.87-.28-1.27-.05l-.37.7z"/>
        <path d="M8.07 11.47l-3.4-2.23c-.2-.13-.44-.18-.67-.13-.23.05-.43.18-.56.37-.13.19-.18.42-.14.65.04.23.16.43.34.56l3.11 2.04c.38.31.91.24 1.18-.17.27-.41.17-.95-.23-1.23l.37.14zM11.03 9.14c-.24.06-.44.21-.56.42-.12.21-.16.46-.09.7.07.24.22.44.44.56l2.58 1.66-2.38.53c-.44.1-.78.44-.86.89-.08.45.12.9.5 1.16.38.26.87.28 1.27.05l4.37-.97c.44-.1.77-.44.84-.89.07-.45-.13-.9-.52-1.15l-3.26-2.14c-.21-.14-.46-.18-.7-.12l-.63-.7z"/>
        <path d="M12.29 6.81c.38.31.91.24 1.18-.17.27-.4.17-.95-.23-1.23l-3.03-2.08c-.2-.14-.44-.19-.67-.14-.23.05-.43.18-.56.37-.13.19-.18.42-.14.65.04.23.16.43.34.56l3.11 2.04z"/>
      </svg>
    ),
    color: '#D32323',
    bgColor: '#FEE7E7',
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#1877F2">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
    color: '#1877F2',
    bgColor: '#E7F0FF',
  },
  zocdoc: {
    id: 'zocdoc',
    name: 'Zocdoc',
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#FF7A59">
        <circle cx="12" cy="12" r="10"/>
        <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">Z</text>
      </svg>
    ),
    color: '#FF7A59',
    bgColor: '#FFF0ED',
  },
};

export function ReviewPrompt({
  reviewUrls,
  onClose,
  onReviewClick,
}: ReviewPromptProps) {
  const availablePlatforms = Object.keys(reviewUrls)
    .filter((key) => reviewUrls[key])
    .map((key) => platforms[key])
    .filter(Boolean);

  if (availablePlatforms.length === 0) {
    return null;
  }

  const handleReviewClick = (platform: ReviewPlatform) => {
    if (onReviewClick) {
      onReviewClick(platform.id);
    }

    const url = reviewUrls[platform.id];
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="review-prompt">
      <div className="review-prompt-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      </div>

      <h3>We're So Glad You Had a Great Experience!</h3>
      <p>
        Would you mind sharing your experience with others?
        It only takes a moment and helps us grow.
      </p>

      <div className="review-platforms">
        {availablePlatforms.map((platform) => (
          <button
            key={platform.id}
            className="review-platform-btn"
            onClick={() => handleReviewClick(platform)}
            style={{
              backgroundColor: platform.bgColor,
              borderColor: platform.color,
            }}
          >
            <span className="platform-icon">{platform.icon}</span>
            <span className="platform-name">Review on {platform.name}</span>
          </button>
        ))}
      </div>

      <button className="review-skip-btn" onClick={onClose}>
        Maybe later
      </button>

      <style>{`
        .review-prompt {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 1.5rem;
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          border-radius: 1rem;
          text-align: center;
          max-width: 400px;
          margin: 0 auto;
        }

        .review-prompt-icon {
          width: 3rem;
          height: 3rem;
          color: #f59e0b;
        }

        .review-prompt-icon svg {
          width: 100%;
          height: 100%;
          fill: #f59e0b;
          stroke: #d97706;
        }

        .review-prompt h3 {
          font-size: 1.125rem;
          font-weight: 600;
          color: #92400e;
          margin: 0;
        }

        .review-prompt p {
          font-size: 0.875rem;
          color: #a16207;
          margin: 0;
        }

        .review-platforms {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          width: 100%;
          margin-top: 0.5rem;
        }

        .review-platform-btn {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          border: 2px solid;
          border-radius: 0.5rem;
          background: white;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
        }

        .review-platform-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .platform-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .platform-name {
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
        }

        .review-skip-btn {
          background: none;
          border: none;
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
          color: #92400e;
          cursor: pointer;
          opacity: 0.7;
          transition: opacity 0.2s;
        }

        .review-skip-btn:hover {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
