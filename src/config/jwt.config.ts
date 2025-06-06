import * as config from 'dotenv';

config.config();

export const jwtConfig = {
  secret: process.env.JWT_SECRET as string,
  signOptions: { expiresIn: '24h' },
};
