import React from 'react';
import '../../styles/telehealth.css';

interface VideoControlsProps {
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onCapturePhoto: () => void;
  onEndCall: () => void;
  isProvider: boolean;
}

const VideoControls: React.FC<VideoControlsProps> = ({
  isMuted,
  isVideoOff,
  isScreenSharing,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onCapturePhoto,
  onEndCall,
  isProvider,
}) => {
  return (
    <div className="bg-gray-800 px-6 py-4">
      <div className="flex items-center justify-center space-x-4">
        {/* Mute Button */}
        <ControlButton
          onClick={onToggleMute}
          active={!isMuted}
          activeColor="bg-gray-600"
          inactiveColor="bg-red-600"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
              />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          )}
        </ControlButton>

        {/* Video Button */}
        <ControlButton
          onClick={onToggleVideo}
          active={!isVideoOff}
          activeColor="bg-gray-600"
          inactiveColor="bg-red-600"
          title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isVideoOff ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
              <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          )}
        </ControlButton>

        {/* Screen Share Button */}
        <ControlButton
          onClick={onToggleScreenShare}
          active={isScreenSharing}
          activeColor="bg-blue-600"
          inactiveColor="bg-gray-600"
          title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </ControlButton>

        {/* Photo Capture Button (Provider Only) */}
        {isProvider && (
          <ControlButton
            onClick={onCapturePhoto}
            active={false}
            activeColor="bg-green-600"
            inactiveColor="bg-gray-600"
            title="Capture photo"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </ControlButton>
        )}

        {/* Divider */}
        <div className="w-px h-10 bg-gray-600 mx-2" />

        {/* End Call Button */}
        <ControlButton
          onClick={onEndCall}
          active={false}
          activeColor="bg-red-600"
          inactiveColor="bg-red-600"
          title="End call"
          large
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"
            />
          </svg>
        </ControlButton>
      </div>
    </div>
  );
};

interface ControlButtonProps {
  onClick: () => void;
  active: boolean;
  activeColor: string;
  inactiveColor: string;
  title: string;
  children: React.ReactNode;
  large?: boolean;
}

const ControlButton: React.FC<ControlButtonProps> = ({
  onClick,
  active,
  activeColor,
  inactiveColor,
  title,
  children,
  large = false,
}) => {
  const size = large ? 'w-16 h-16' : 'w-12 h-12';
  const bgColor = active ? activeColor : inactiveColor;

  return (
    <button
      onClick={onClick}
      title={title}
      className={`${size} ${bgColor} rounded-full flex items-center justify-center text-white hover:opacity-90 transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800`}
    >
      {children}
    </button>
  );
};

export default VideoControls;
