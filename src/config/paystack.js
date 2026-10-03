import dotenv from 'dotenv';

dotenv.config();

export const paystackConfig = {
  secretKey: process.env.PAYSTACK_SECRET_KEY,
  publicKey: process.env.PAYSTACK_PUBLIC_KEY,
  baseURL: process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co'
};

export const paystackConfigured = () => Boolean(paystackConfig.secretKey);

// Paystack API helper function
export const paystackRequest = async (endpoint, method = 'GET', data = null) => {
  const url = `${paystackConfig.baseURL}${endpoint}`;
  
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${paystackConfig.secretKey}`,
      'Content-Type': 'application/json',
    },
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || 'Paystack API request failed');
    }
    
    return result;
  } catch (error) {
    console.error('Paystack API Error:', error.message);
    throw error;
  }
};