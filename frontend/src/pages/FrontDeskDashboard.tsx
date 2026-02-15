import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { QuickStatsBar, type DailyStats } from '../components/FrontDesk/QuickStatsBar';
import {
  TodaySchedulePanel,
  type AppointmentWithDetails,
} from '../components/FrontDesk/TodaySchedulePanel';
import { WaitingRoom, type WaitingRoomPatient } from '../components/FrontDesk/WaitingRoom';
import { UpcomingAlerts } from '../components/FrontDesk/UpcomingAlerts';
import {
  PatientCheckIn,
  type CheckInData,
} from '../components/FrontDesk/PatientCheckIn';
import {
  PatientCheckOut,
  type CheckOutData,
} from '../components/FrontDesk/PatientCheckOut';
import api from '../api';

const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds

export const FrontDeskDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [appointments, setAppointments] = useState<AppointmentWithDetails[]>([]);
  const [waitingPatients, setWaitingPatients] = useState<WaitingRoomPatient[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<
    AppointmentWithDetails[]
  >([]);
  const [selectedAppointment, setSelectedAppointment] =
    useState<AppointmentWithDetails | null>(null);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [checkOutModalOpen, setCheckOutModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only trigger if not typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'r':
          fetchAllData();
          break;
        case 'n':
          // Jump to next patient
          if (appointments.length > 0) {
            const nextScheduled = appointments.find((a) => a.status === 'scheduled');
            if (nextScheduled) {
              setSelectedAppointment(nextScheduled);
              setCheckInModalOpen(true);
            }
          }
          break;
        case 'c':
          // Quick check-in for first waiting
          if (appointments.length > 0) {
            const firstScheduled = appointments.find((a) => a.status === 'scheduled');
            if (firstScheduled) {
              handleQuickCheckIn(firstScheduled.id);
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [appointments]);

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    try {
      const [statsRes, scheduleRes, waitingRes, upcomingRes] = await Promise.all([
        api.get('/api/front-desk/stats'),
        api.get('/api/front-desk/today'),
        api.get('/api/front-desk/waiting'),
        api.get('/api/front-desk/upcoming?limit=5'),
      ]);

      setStats(statsRes.data);
      setAppointments(scheduleRes.data.appointments || []);
      setWaitingPatients(waitingRes.data.patients || []);
      setUpcomingAppointments(upcomingRes.data.appointments || []);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error fetching front desk data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAllData();
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchAllData]);

  // Handle quick check-in (no modal)
  const handleQuickCheckIn = async (appointmentId: string) => {
    try {
      const response = await api.post(`/api/front-desk/check-in/${appointmentId}`);
      await fetchAllData();
      // Show success notification with encounter link
      if (response.data.encounterId) {
        console.log('Patient checked in successfully - Encounter:', response.data.encounterId);
        // Could navigate to encounter: navigate(`/encounters/${response.data.encounterId}`);
      }
    } catch (error) {
      console.error('Error checking in patient:', error);
    }
  };

  // Handle check-in with modal
  const handleCheckInWithModal = (appointment: AppointmentWithDetails) => {
    setSelectedAppointment(appointment);
    setCheckInModalOpen(true);
  };

  // Handle check-in submit
  const handleCheckInSubmit = async (appointmentId: string, data: CheckInData) => {
    try {
      // In production, would send the full data
      const response = await api.post(`/api/front-desk/check-in/${appointmentId}`, data);

      // If payment was collected, would also call payment endpoint
      if (data.paymentCollected && data.paymentCollected > 0) {
        // await api.post('/api/patient-payments', { ... });
      }

      await fetchAllData();
      setCheckInModalOpen(false);
      setSelectedAppointment(null);

      // Show encounter created notification
      if (response.data.encounterId) {
        console.log('Encounter created:', response.data.encounterId);
        // Optional: Navigate to encounter
        // navigate(`/encounters/${response.data.encounterId}`);
      }
    } catch (error) {
      console.error('Error checking in patient:', error);
      throw error;
    }
  };

  // Handle check-out with modal
  const handleCheckOutWithModal = (appointment: AppointmentWithDetails) => {
    setSelectedAppointment(appointment);
    setCheckOutModalOpen(true);
  };

  // Handle check-out submit
  const handleCheckOutSubmit = async (
    appointmentId: string,
    data: CheckOutData
  ) => {
    try {
      await api.post(`/api/front-desk/check-out/${appointmentId}`, data);

      // If payment was collected, would also call payment endpoint
      if (data.paymentCollected && data.paymentCollected > 0) {
        // await api.post('/api/patient-payments', { ... });
      }

      // If follow-up was scheduled, would create appointment
      if (data.followUpScheduled && data.followUpDate) {
        // await api.post('/api/appointments', { ... });
      }

      await fetchAllData();
      setCheckOutModalOpen(false);
      setSelectedAppointment(null);
    } catch (error) {
      console.error('Error checking out patient:', error);
      throw error;
    }
  };

  // Handle status change
  const handleStatusChange = async (appointmentId: string, status: string) => {
    try {
      await api.put(`/api/front-desk/status/${appointmentId}`, { status });
      await fetchAllData();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  // Handle move to room
  const handleMoveToRoom = async (appointmentId: string) => {
    await handleStatusChange(appointmentId, 'in_room');
  };

  // Handle select appointment
  const handleSelectAppointment = (appointment: AppointmentWithDetails) => {
    // Navigate to patient chart
    navigate(`/patients/${appointment.patientId}`);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Front Desk Dashboard
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchAllData}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Refresh (R)
              </button>
              <div className="text-xs text-gray-500 bg-gray-100 px-3 py-2 rounded">
                <div className="font-medium mb-1">Keyboard Shortcuts:</div>
                <div>R = Refresh | N = Next Patient | C = Quick Check-In</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats Bar */}
        <QuickStatsBar stats={stats} isLoading={isLoading} />

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Schedule */}
          <div className="lg:col-span-2">
            <TodaySchedulePanel
              appointments={appointments}
              onCheckIn={handleQuickCheckIn}
              onCheckOut={(id) => {
                const apt = appointments.find((a) => a.id === id);
                if (apt) handleCheckOutWithModal(apt);
              }}
              onStatusChange={handleStatusChange}
              onSelectAppointment={handleSelectAppointment}
              isLoading={isLoading}
            />
          </div>

          {/* Right Column - Waiting Room & Alerts */}
          <div className="space-y-6">
            <WaitingRoom
              patients={waitingPatients}
              onMoveToRoom={handleMoveToRoom}
              isLoading={isLoading}
            />
            <UpcomingAlerts
              upcomingAppointments={upcomingAppointments}
              isLoading={isLoading}
            />
          </div>
        </div>
      </div>

      {/* Modals */}
      {checkInModalOpen && (
        <PatientCheckIn
          appointment={selectedAppointment}
          onClose={() => {
            setCheckInModalOpen(false);
            setSelectedAppointment(null);
          }}
          onCheckIn={handleCheckInSubmit}
        />
      )}

      {checkOutModalOpen && (
        <PatientCheckOut
          appointment={selectedAppointment}
          onClose={() => {
            setCheckOutModalOpen(false);
            setSelectedAppointment(null);
          }}
          onCheckOut={handleCheckOutSubmit}
        />
      )}

      {/* Sound Alert for New Arrivals (would be implemented with actual audio) */}
      {/* Visual notification banner could go here */}
    </div>
  );
};

export default FrontDeskDashboard;
