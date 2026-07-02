import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id:           string;
      name?:        string | null;
      email?:       string | null;
      image?:       string | null;
      username:     string;
      backendToken: string;
      isNew:        boolean;
      phone?:       string;
    };
  }

  interface User {
    id:           string;
    backendToken: string;
    username:     string;
    isNew:        boolean;
    phone?:       string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?:       string;
    backendToken?: string;
    username?:     string;
    isNew?:        boolean;
    phone?:        string;
  }
}
