import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  FormControl,
  FormLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import MuiCard from "@mui/material/Card";
import { styled } from "@mui/material/styles";
import { useAuthStore } from "../store/useAuthStore";

const LoginCard = styled(MuiCard)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignSelf: "center",
  width: "100%",
  padding: theme.spacing(4),
  gap: theme.spacing(2),
  margin: "auto",
  boxShadow:
    "hsla(220, 30%, 5%, 0.08) 0px 6px 16px 0px, hsla(220, 25%, 10%, 0.07) 0px 18px 40px -6px",
  [theme.breakpoints.up("sm")]: {
    width: "450px",
  },
}));

const LoginContainer = styled(Stack)(({ theme }) => ({
  minHeight: "100vh",
  padding: theme.spacing(2),
  [theme.breakpoints.up("sm")]: {
    padding: theme.spacing(4),
  },
  position: "relative",
  "&::before": {
    content: '""',
    display: "block",
    position: "absolute",
    inset: 0,
    zIndex: -1,
    backgroundImage:
      "radial-gradient(ellipse at 50% 0%, hsl(188, 72%, 94%), hsl(0, 0%, 100%))",
    backgroundRepeat: "no-repeat",
  },
}));

export default function LoginPage() {
  const { login, authLoading, authError } = useAuthStore();
  const [email, setEmail] = useState("admin@oikonomos.local");
  const [password, setPassword] = useState("ChangeMe123!");
  const [formError, setFormError] = useState<string | null>(null);

  function validateInputs(): boolean {
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setFormError("Please enter a valid email address.");
      return false;
    }
    if (!password || password.length < 6) {
      setFormError("Password must be at least 6 characters long.");
      return false;
    }
    setFormError(null);
    return true;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!validateInputs()) {
      return;
    }
    await login({ email, password });
  }

  return (
    <LoginContainer direction="column" justifyContent="center" alignItems="center">
      <LoginCard variant="outlined">
        <Typography component="h1" variant="h4" sx={{ fontSize: "clamp(1.75rem, 8vw, 2.2rem)" }}>
          Oikonomos Sign In
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Sign in to continue with your finance workspace.
        </Typography>

        {(formError || authError) && <Alert severity="error">{formError ?? authError}</Alert>}

        <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <FormControl>
            <FormLabel htmlFor="email">Email</FormLabel>
            <TextField
              id="email"
              name="email"
              type="email"
              required
              fullWidth
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              placeholder="you@example.com"
            />
          </FormControl>

          <FormControl>
            <FormLabel htmlFor="password">Password</FormLabel>
            <TextField
              id="password"
              name="password"
              type="password"
              required
              fullWidth
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              placeholder="******"
            />
          </FormControl>

          <Button type="submit" fullWidth variant="contained" disabled={authLoading}>
            {authLoading ? "Signing in..." : "Sign in"}
          </Button>
        </Box>
      </LoginCard>
    </LoginContainer>
  );
}
