import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface CannedResponse {
  id: string;
  title: string;
  category: string;
  responseText: string;
}

interface CannedResponseSelectorProps {
  category?: string;
  onSelect: (responseText: string) => void;
  onClose: () => void;
}

export const CannedResponseSelector: FC<CannedResponseSelectorProps> = ({
  category,
  onSelect,
  onClose,
}) => {
  const { session } = useAuth();
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(category || 'all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchCannedResponses();
  }, []);

  const fetchCannedResponses = async () => {
    if (!session) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/canned-responses?activeOnly=true`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'X-Tenant-ID': session.tenantId,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch canned responses');

      const data = await response.json();
      setResponses(data.cannedResponses || []);
    } catch (error) {
      console.error('Error fetching canned responses:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredResponses = responses.filter((response) => {
    const matchesCategory =
      selectedCategory === 'all' || response.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      response.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      response.responseText.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const categories = ['all', 'general', 'prescription', 'appointment', 'billing', 'medical', 'other'];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        <div className="inline-block w-full max-w-3xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white rounded-lg shadow-xl">
          {/* Header */}
          <div className="px-6 py-4 bg-purple-600">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-white">Canned Responses</h3>
              <button
                onClick={onClose}
                className="text-white hover:text-gray-200 focus:outline-none"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Search and filters */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search responses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Response list */}
          <div className="px-6 py-4 max-h-96 overflow-y-auto">
            {loading ? (
              <div className="text-center py-8">
                <div className="inline-block w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredResponses.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No canned responses found</p>
                <p className="text-sm mt-2">Try adjusting your search or filter</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredResponses.map((response) => (
                  <div
                    key={response.id}
                    onClick={() => onSelect(response.responseText)}
                    className="p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-purple-50 hover:border-purple-300 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900">{response.title}</h4>
                      <span className="px-2 py-1 text-xs font-medium text-purple-700 bg-purple-100 rounded">
                        {response.category}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2">{response.responseText}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Click a response to insert it into your message
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
