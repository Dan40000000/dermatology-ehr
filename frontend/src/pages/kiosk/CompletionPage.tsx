import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KioskLayout } from '../../components/kiosk/KioskLayout';

export function KioskCompletionPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Auto-return to welcome screen after 10 seconds
    const timeoutId = setTimeout(() => {
      sessionStorage.clear();
      navigate('/kiosk');
    }, 10000);

    return () => clearTimeout(timeoutId);
  }, [navigate]);

  const handleDone = () => {
    sessionStorage.clear();
    navigate('/kiosk');
  };

  return (
    <KioskLayout showProgress={false}>
      <div className="bg-white rounded-2xl shadow-2xl p-12 text-center">
        {/* Success icon */}
        <div className="flex justify-center mb-8">
          <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center animate-pulse">
            <svg className="w-20 h-20 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        {/* Success message */}
        <h1 className="text-5xl font-bold text-gray-900 mb-6">You're All Checked In!</h1>

        <div className="mb-12">
          <p className="text-2xl text-gray-700 mb-4">Thank you for completing the check-in process.</p>
          <p className="text-xl text-gray-600">
            Please have a seat in the waiting room. A staff member will call you shortly.
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-8 mb-8">
          <h2 className="text-2xl font-semibold text-purple-900 mb-4">What happens next?</h2>
          <div className="space-y-3 text-left">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="font-bold">1</span>
              </div>
              <p className="text-lg text-purple-800">
                Our staff has been notified of your arrival
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="font-bold">2</span>
              </div>
              <p className="text-lg text-purple-800">
                Please wait in the designated waiting area
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="font-bold">3</span>
              </div>
              <p className="text-lg text-purple-800">
                You will be called when we are ready for you
              </p>
            </div>
          </div>
        </div>

        {/* Auto-return message */}
        <p className="text-lg text-gray-500 mb-8">
          This screen will automatically return to the welcome page in a few seconds...
        </p>

        {/* Done button */}
        <button
          onClick={handleDone}
          className="px-16 py-5 text-2xl font-bold text-white bg-purple-600 rounded-xl hover:bg-purple-700 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
        >
          Done
        </button>

        {/* Thank you message */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-xl text-gray-600">
            Thank you for choosing our practice!
          </p>
          <p className="text-lg text-gray-500 mt-2">
            We appreciate your time and look forward to serving you.
          </p>
        </div>
      </div>
    </KioskLayout>
  );
}
