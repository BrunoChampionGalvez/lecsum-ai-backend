import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { jwtConfig } from '../../config/jwt.config';

// Define the expected shape of the JWT payload
interface JwtPayload {
  sub: string; // Typically the user ID
  email: string;
  iat?: number; // Issued at (optional, but standard)
  exp?: number; // Expiration time (optional, but standard)
}

// Define the shape of the user object attached to the request after JWT validation
export interface AuthenticatedUserContext {
  id: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConfig.secret,
    });
  }

  // Validate method now uses JwtPayload and returns AuthenticatedUserContext
  // Removed async as no await is used
  validate(payload: JwtPayload): AuthenticatedUserContext {
    // The payload is already validated by passport-jwt by this point.
    // We just need to return the user information we want to attach to the request object.
    return { id: payload.sub, email: payload.email };
  }
}
