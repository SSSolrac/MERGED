import { AuthProvider as UnifiedAuthProvider } from "../context/AuthContext";

export default function AuthProvider(props) {
  return <UnifiedAuthProvider {...props} />;
}
