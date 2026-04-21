import { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { 
      endpoint, 
      host, 
      authorization, 
      action, 
      version, 
      timestamp, 
      region, 
      payload 
    } = JSON.parse(event.body || '{}');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Host': host,
        'Authorization': authorization,
        'X-TC-Action': action,
        'X-TC-Version': version,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Region': region,
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(json),
    };
  } catch (error) {
    console.error('Tencent API Proxy Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal Server Error', 
        message: error instanceof Error ? error.message : String(error) 
      }),
    };
  }
};
