import { supabaseAdmin, supabaseAuth } from '../services/supabaseAdmin.js';
import { AppError, fromSupabaseError } from '../utils/appError.js';

export async function requireAuth(request, response, next) {
  const authorization = request.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!token) {
    return next(new AppError({ status: 401, code: 'MISSING_TOKEN', message: 'Missing Bearer token' }));
  }

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);

  if (error || !user) {
    return next(new AppError({ status: 401, code: 'INVALID_TOKEN', message: 'Invalid or expired token' }));
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return next(fromSupabaseError(profileError, { status: 403, code: 'PROFILE_LOOKUP_FAILED' }));
  }

  if (!profile) {
    return next(new AppError({ status: 403, code: 'PROFILE_NOT_FOUND', message: 'User profile is required' }));
  }

  request.user = user;
  request.profile = profile;
  request.accessToken = token;
  return next();
}

export function requireRoles(...allowedRoles) {
  return (request, _response, next) => {
    const role = request.profile?.role;

    if (!role) {
      return next(new AppError({ status: 403, code: 'ROLE_MISSING', message: 'User role not found' }));
    }

    if (!allowedRoles.includes(role)) {
      return next(
        new AppError({
          status: 403,
          code: 'FORBIDDEN_ROLE',
          message: `Role ${role} is not allowed to perform this action`,
          details: { allowedRoles },
        })
      );
    }

    return next();
  };
}
