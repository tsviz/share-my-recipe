// Express session and Flash augmentations
declare global {
  namespace Express {
    interface Request {
      flash(type: string, message?: any): any;
      logout(callback: (err: any) => void): void;
    }
  }
}

// Makes this file a module
export {};