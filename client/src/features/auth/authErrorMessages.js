function includesAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
}

function withHint(message, hint = '') {
  return { message, hint };
}

export function toFriendlyAuthMessage(error, mode = 'signin') {
  const fallback = mode === 'signin' ? 'Unable to sign in right now. Please try again.' : 'Unable to create account right now. Please try again.';

  if (!error) {
    return withHint(fallback);
  }

  const rawMessage = String(error.message || '').trim();
  const normalized = rawMessage.toLowerCase();

  if (mode === 'signin') {
    if (includesAny(normalized, ['invalid login credentials', 'invalid credentials'])) {
      return withHint('Incorrect email or password. Check your details and try again.', 'Reset your password or switch to Sign up if you are new.');
    }

    if (includesAny(normalized, ['email not confirmed', 'email not verified'])) {
      return withHint('Your email is not confirmed yet. Check your inbox for the verification link.', 'Search for the latest confirmation email, including your spam folder.');
    }

    if (includesAny(normalized, ['refresh token', 'jwt', 'session expired'])) {
      return withHint('Your session expired. Please sign in again.', 'Sign in again to refresh your session token.');
    }
  }

  if (mode === 'signup') {
    if (includesAny(normalized, ['user already registered', 'already registered', 'already exists'])) {
      return withHint('This email is already registered. Try signing in instead.', 'Use Sign in for this email, or use Forgot password if needed.');
    }

    if (includesAny(normalized, ['password should be at least', 'password is too weak', 'weak password'])) {
      return withHint('Password is too weak. Use at least 6 characters with a mix of letters and numbers.', 'Try a longer password with upper/lowercase letters and numbers.');
    }

    if (includesAny(normalized, ['invalid email', 'email address'])) {
      return withHint('Please enter a valid email address.', 'Double-check for typos like missing "@" or domain parts.');
    }
  }

  if (error.status === 422) {
    return mode === 'signup'
      ? withHint(
          'We could not create the account with these details. Please review your input and try again.',
          'Check your email format and password strength, then retry.'
        )
      : withHint('Your sign-in details could not be validated. Please try again.', 'Verify your credentials and try once more.');
  }

  if (error.status === 400) {
    return mode === 'signup'
      ? withHint(
          'The sign-up request was rejected. Please verify your email and password and try again.',
          'If this continues, try Sign in in case the account already exists.'
        )
      : withHint('The sign-in request was rejected. Please verify your email and password and try again.', 'If your password is forgotten, use the reset flow.');
  }

  return withHint(rawMessage || fallback);
}
