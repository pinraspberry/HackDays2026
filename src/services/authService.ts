import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { auth } from "../firebase";

export const registerUser = (
  email: string,
  password: string
) => createUserWithEmailAndPassword(auth, email, password);

export const loginUser = async (
  email: string,
  password: string
) => {
  const res = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  console.log("LOGIN SUCCESS:", res.user.email);

  return res;
};

export const logoutUser = () =>
  signOut(auth);