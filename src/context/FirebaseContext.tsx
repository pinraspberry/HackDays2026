import React, { createContext, useContext, useState, useEffect } from "react";
import type { User } from "firebase/auth";
import {
  GoogleAuthProvider,
  signInWithCredential,
} from "firebase/auth";

import { auth, db } from "../firebase";
import { useSettings } from "./SettingsContext";

interface FirebaseContextType {
  db: any;
  auth: any;
  user: User | null;
  loading: boolean;
  signInWithGoogle: (credentialToken: string) => Promise<any>;
  isFirebaseActive: boolean;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(
  undefined
);

export const FirebaseProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  console.log("PROVIDER START");
  
  const isDemo = false;
  console.log("AFTER SETTINGS");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbInstance, setDbInstance] = useState<any>(null);
  const [authInstance, setAuthInstance] = useState<any>(null);
  const [isFirebaseActive, setIsFirebaseActive] = useState(false);
  
useEffect(() => {
  console.log("FIREBASE CONTEXT MOUNTED");

  console.log("AUTH OBJECT =", auth);

  const unsubscribe = auth.onAuthStateChanged((u) => {
    console.log("AUTH STATE CHANGED:", u);

    setUser(u);
    setLoading(false);
  });

  return () => unsubscribe();
}, []);
  const signInWithGoogle = async (
    credentialToken: string
  ) => {
    const credential =
      GoogleAuthProvider.credential(credentialToken);

    const res = await signInWithCredential(
      auth,
      credential
    );

    return res;
  };

  return (
    <FirebaseContext.Provider
      value={{
        db: dbInstance,
        auth: authInstance,
        user,
        loading,
        signInWithGoogle,
        isFirebaseActive,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);

  if (!context) {
    throw new Error(
      "useFirebase must be used within FirebaseProvider"
    );
  }

  return context;
};