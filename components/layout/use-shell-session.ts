// The shell's only dependency on authentication, which HRITHIK owns.
//
// When the frontend auth implementation lands, this hook should return:
//   - user: the signed-in user from GET /api/auth/me/ (the fields below are a subset of that response)
//   - logout: the app's single logout, which clears tokens and redirects to the login route
//
// Until then there is no signed-in user: the shell shows no account details and both logout
// actions (sidebar and account menu) stay disabled. Do not add token or API logic here.

export type ShellUser = {
  name: string;
  email: string;
  role: "ADMIN" | "STAFF";
};

export type ShellSession = {
  user: ShellUser | null;
  logout: (() => void) | null;
};

export function useShellSession(): ShellSession {
  return { user: null, logout: null };
}
