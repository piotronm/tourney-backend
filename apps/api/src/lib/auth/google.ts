import axios from 'axios';
import { env } from '../../env.js';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token: string; // JWT with user info
}

interface GoogleUserInfo {
  sub: string; // Google user ID (unique)
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
  given_name?: string;
  family_name?: string;
  locale?: string;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    throw new Error('Google OAuth environment variables not configured');
  }

  // Google's token endpoint requires application/x-www-form-urlencoded
  const params = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  const response = await axios.post<GoogleTokenResponse>(
    'https://oauth2.googleapis.com/token',
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  return response.data;
}

/**
 * Decode and validate Google ID token
 * In production, you should verify the signature using google-auth-library
 */
export function decodeIdToken(idToken: string): GoogleUserInfo {
  // ID token is a JWT: header.payload.signature
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid ID token format');
  }

  const payload = Buffer.from(parts[1]!, 'base64url').toString('utf-8');
  const userInfo = JSON.parse(payload) as GoogleUserInfo;

  // Basic validation
  if (!userInfo.sub || !userInfo.email) {
    throw new Error('Invalid user info in ID token');
  }

  if (!userInfo.email_verified) {
    throw new Error('Email not verified by Google');
  }

  // Validate issuer (Google)
  const iss = (userInfo as any).iss;
  if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') {
    throw new Error('Invalid token issuer');
  }

  // Validate audience (our client ID)
  if (env.GOOGLE_CLIENT_ID) {
    const aud = (userInfo as any).aud;
    if (aud !== env.GOOGLE_CLIENT_ID) {
      throw new Error('Invalid token audience');
    }
  }

  return userInfo;
}

/**
 * Get user info from Google (alternative to decoding ID token)
 */
export async function getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await axios.get<GoogleUserInfo>(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  return response.data;
}

/**
 * Generate Google OAuth authorization URL with PKCE-style state
 */
export function getAuthorizationUrl(state: string): string {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
    throw new Error('Google OAuth environment variables not configured');
  }

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state, // CSRF protection
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
