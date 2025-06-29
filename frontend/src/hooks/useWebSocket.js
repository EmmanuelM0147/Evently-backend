import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

export const useWebSocket = () => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    
    if (!token) {
      console.log('No auth token found, skipping WebSocket connection');
      return;
    }

    const initializeSocket = () => {
      console.log('Initializing WebSocket connection...');
      
      const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:3000', {
        auth: {
          token
        },
        transports: ['websocket', 'polling'],
        timeout: 10000,
        retries: 3
      });

      // Connection event handlers
      newSocket.on('connect', () => {
        console.log('🔌 WebSocket connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0; // Reset reconnect attempts on successful connection
      });

      newSocket.on('disconnect', (reason) => {
        console.log('🔌 WebSocket disconnected:', reason);
        setIsConnected(false);
        
        // Only attempt to reconnect for certain disconnect reasons
        if (reason === 'io server disconnect') {
          // Server-initiated disconnect, don't reconnect automatically
          return;
        }
        
        // Attempt to reconnect for client-side disconnects
        attemptReconnect();
      });

      newSocket.on('connect_error', (error) => {
        console.error('🔌 WebSocket connection error:', error.message);
        setIsConnected(false);
        attemptReconnect();
      });

      // Custom event handlers
      newSocket.on('error', (error) => {
        console.error('🔌 WebSocket error:', error);
      });

      setSocket(newSocket);
    };

    const attemptReconnect = () => {
      if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        console.log('🔌 Max reconnection attempts reached');
        return;
      }

      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000); // Exponential backoff, max 30s
      reconnectAttemptsRef.current += 1;

      console.log(`🔌 Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);

      reconnectTimeoutRef.current = setTimeout(() => {
        if (socket) {
          socket.disconnect();
        }
        initializeSocket();
      }, delay);
    };

    initializeSocket();

    // Cleanup function
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (socket) {
        console.log('🔌 Disconnecting WebSocket...');
        socket.disconnect();
      }
    };
  }, []); // Empty dependency array since we want this to run once

  // Function to manually reconnect
  const reconnect = () => {
    if (socket) {
      socket.connect();
    }
  };

  // Function to join event room
  const joinEventRoom = (eventId) => {
    if (socket && isConnected) {
      socket.emit('join_event', eventId);
    }
  };

  // Function to leave event room
  const leaveEventRoom = (eventId) => {
    if (socket && isConnected) {
      socket.emit('leave_event', eventId);
    }
  };

  // Function to check payment status
  const checkPaymentStatus = (paymentReference) => {
    if (socket && isConnected) {
      socket.emit('check_payment_status', paymentReference);
    }
  };

  return {
    socket,
    isConnected,
    reconnect,
    joinEventRoom,
    leaveEventRoom,
    checkPaymentStatus
  };
};