import { useState } from "react";
import { loginUser, registerUser } from "../services/authService";
import { auth } from "../firebase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(false);

  const handleSubmit = async () => {
    console.log("BUTTON CLICKED");
    try {
        console.log("MODE =", isLogin ? "LOGIN" : "REGISTER");
      if (isLogin) {
        await loginUser(email, password);
      } else {
        const res = await registerUser(email, password);
        console.log("REGISTER SUCCESS:", res.user.email);
        alert("REGISTER SUCCESS");
      }
    } catch (err: any) {
  console.log("ERROR CODE:", err.code);
  console.log(err);
  alert(err.code);
}
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-navy-950">
      <h1 className="text-4xl font-bold text-cyan-400 mb-6">
        PULSE
      </h1>

      <input
        className="p-3 rounded mb-3 w-72 text-black"
        placeholder="Email"
        value={email}
        onChange={(e)=>setEmail(e.target.value)}
      />

      <input
        type="password"
        className="p-3 rounded mb-3 w-72 text-black"
        placeholder="Password"
        value={password}
        onChange={(e)=>setPassword(e.target.value)}
      />

      <button
        onClick={handleSubmit}
        className="bg-cyan-500 px-6 py-3 rounded"
      >
        {isLogin ? "Login" : "Register"}
      </button>

      <button
        className="mt-4 text-cyan-400"
        onClick={() => setIsLogin(!isLogin)}
      >
        {isLogin
          ? "Create Account"
          : "Already have an account?"}
      </button>
    </div>
  );
}