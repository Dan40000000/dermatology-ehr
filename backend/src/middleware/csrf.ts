import csrf from 'csurf';
import { loadEnv } from '../config/validate';

export const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: loadEnv().NODE_ENV === 'production',
    sameSite: 'strict'
  }
});
