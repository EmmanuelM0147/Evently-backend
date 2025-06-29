import React, { useState, useEffect } from 'react';
import { X, CreditCard, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';

const PaymentModal = ({ isOpen, onClose, event, onPaymentSuccess }) => {
  const [paymentData, setPaymentData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [attendeeName, setAttendeeName] = useState('');
  const [attendeeEmail, setAttendeeEmail] = useState('');
  const [errors, setErrors] = useState({});
  const { socket } = useWebSocket();

  useEffect(() => {
    if (!socket) return;

    // Listen for payment status updates
    socket.on('payment_status_update', (update) => {
      if (paymentData && update.reference === paymentData.reference) {
        setPaymentStatus(update.status);
        setIsProcessing(false);

        if (update.status === 'success') {
          setTimeout(() => {
            onPaymentSuccess && onPaymentSuccess(update);
            onClose();
          }, 2000);
        }
      }
    });

    return () => {
      socket.off('payment_status_update');
    };
  }, [socket, paymentData, onPaymentSuccess, onClose]);

  useEffect(() => {
    // Reset state when modal opens/closes
    if (isOpen) {
      setPaymentData(null);
      setPaymentStatus(null);
      setIsProcessing(false);
      setErrors({});
      
      // Pre-fill user data if available
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      if (userData.username) setAttendeeName(userData.username);
      if (userData.email) setAttendeeEmail(userData.email);
    }
  }, [isOpen]);

  const validateForm = () => {
    const newErrors = {};

    if (!attendeeName.trim()) {
      newErrors.attendeeName = 'Name is required';
    } else if (attendeeName.trim().length < 2) {
      newErrors.attendeeName = 'Name must be at least 2 characters';
    }

    if (!attendeeEmail.trim()) {
      newErrors.attendeeEmail = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(attendeeEmail)) {
      newErrors.attendeeEmail = 'Invalid email format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const initializePayment = async () => {
    if (!validateForm()) return;

    setIsProcessing(true);
    setErrors({});

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_id: event.id,
          attendee_name: attendeeName.trim(),
          attendee_email: attendeeEmail.trim()
        })
      });

      const data = await response.json();

      if (data.success) {
        setPaymentData(data.data);
        // Open Paystack popup
        const handler = PaystackPop.setup({
          key: process.env.REACT_APP_PAYSTACK_PUBLIC_KEY || 'pk_test_your_public_key_here',
          email: attendeeEmail.trim(),
          amount: data.data.amount * 100, // Convert to kobo
          currency: 'NGN',
          ref: data.data.reference,
          metadata: {
            event_title: event.title,
            attendee_name: attendeeName.trim()
          },
          callback: (response) => {
            handlePaymentCallback(response);
          },
          onClose: () => {
            setIsProcessing(false);
            setPaymentStatus('cancelled');
          }
        });

        handler.openIframe();
      } else {
        setErrors({ general: data.error || 'Payment initialization failed' });
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('Payment initialization error:', error);
      setErrors({ general: 'Network error. Please try again.' });
      setIsProcessing(false);
    }
  };

  const handlePaymentCallback = async (response) => {
    setPaymentStatus('verifying');

    try {
      const token = localStorage.getItem('authToken');
      const verifyResponse = await fetch(`/api/payments/verify/${response.reference}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const verifyData = await verifyResponse.json();

      if (verifyData.success && verifyData.data.status === 'success') {
        setPaymentStatus('success');
        setTimeout(() => {
          onPaymentSuccess && onPaymentSuccess(verifyData.data);
          onClose();
        }, 2000);
      } else {
        setPaymentStatus('failed');
        setErrors({ general: verifyData.error || 'Payment verification failed' });
      }
    } catch (error) {
      console.error('Payment verification error:', error);
      setPaymentStatus('failed');
      setErrors({ general: 'Verification failed. Please contact support.' });
    }

    setIsProcessing(false);
  };

  const getStatusIcon = () => {
    switch (paymentStatus) {
      case 'success':
        return <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />;
      case 'failed':
      case 'cancelled':
        return <XCircle className="w-16 h-16 text-red-500 mx-auto" />;
      case 'verifying':
        return <Loader2 className="w-16 h-16 text-blue-500 mx-auto animate-spin" />;
      default:
        return null;
    }
  };

  const getStatusMessage = () => {
    switch (paymentStatus) {
      case 'success':
        return {
          title: 'Payment Successful!',
          message: 'Your payment has been processed successfully. You are now registered for the event.'
        };
      case 'failed':
        return {
          title: 'Payment Failed',
          message: 'Your payment could not be processed. Please try again or contact support.'
        };
      case 'cancelled':
        return {
          title: 'Payment Cancelled',
          message: 'Payment was cancelled. You can try again anytime.'
        };
      case 'verifying':
        return {
          title: 'Verifying Payment...',
          message: 'Please wait while we confirm your payment.'
        };
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {paymentStatus ? 'Payment Status' : 'Complete Payment'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isProcessing}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {paymentStatus ? (
            // Payment Status Screen
            <div className="text-center">
              {getStatusIcon()}
              <div className="mt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {getStatusMessage()?.title}
                </h3>
                <p className="text-gray-600 mb-6">
                  {getStatusMessage()?.message}
                </p>
                
                {paymentStatus === 'success' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <h4 className="font-medium text-green-900 mb-2">Event Details</h4>
                    <p className="text-sm text-green-700">
                      <strong>Event:</strong> {event.title}
                    </p>
                    <p className="text-sm text-green-700">
                      <strong>Amount Paid:</strong> ₦{event.price?.toLocaleString()}
                    </p>
                    <p className="text-sm text-green-700">
                      <strong>Attendee:</strong> {attendeeName}
                    </p>
                  </div>
                )}

                {(paymentStatus === 'failed' || paymentStatus === 'cancelled') && (
                  <button
                    onClick={() => {
                      setPaymentStatus(null);
                      setErrors({});
                    }}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Try Again
                  </button>
                )}
              </div>
            </div>
          ) : (
            // Payment Form
            <>
              {/* Event Info */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">{event.title}</h3>
                <div className="space-y-1 text-sm text-gray-600">
                  <p><strong>Date:</strong> {new Date(event.date).toLocaleDateString()}</p>
                  <p><strong>Location:</strong> {event.location}</p>
                  <p><strong>Amount:</strong> ₦{event.price?.toLocaleString()}</p>
                </div>
              </div>

              {/* Error Message */}
              {errors.general && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <p className="text-red-700 text-sm">{errors.general}</p>
                </div>
              )}

              {/* Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Attendee Name *
                  </label>
                  <input
                    type="text"
                    value={attendeeName}
                    onChange={(e) => setAttendeeName(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.attendeeName ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Enter attendee name"
                    disabled={isProcessing}
                  />
                  {errors.attendeeName && (
                    <p className="text-red-500 text-xs mt-1">{errors.attendeeName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={attendeeEmail}
                    onChange={(e) => setAttendeeEmail(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.attendeeEmail ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Enter email address"
                    disabled={isProcessing}
                  />
                  {errors.attendeeEmail && (
                    <p className="text-red-500 text-xs mt-1">{errors.attendeeEmail}</p>
                  )}
                </div>
              </div>

              {/* Payment Button */}
              <button
                onClick={initializePayment}
                disabled={isProcessing}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2 mt-6"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    <span>Pay ₦{event.price?.toLocaleString()}</span>
                  </>
                )}
              </button>

              {/* Security Notice */}
              <div className="mt-4 text-center">
                <p className="text-xs text-gray-500">
                  🔒 Secure payment powered by Paystack
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;