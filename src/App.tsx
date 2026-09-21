import React, { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AuthProvider } from "@/context/AuthContext";
import { AppPreferencesProvider } from "@/context/AppPreferencesContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Route-level lazy imports — each page loads only when first visited
const Dashboard     = lazy(() => import("@/components/Dashboard").then(m => ({ default: m.Dashboard })));
const Library       = lazy(() => import("@/components/Library").then(m => ({ default: m.Library })));
const Practice      = lazy(() => import("@/components/Practice").then(m => ({ default: m.Practice })));
const Progress      = lazy(() => import("@/components/Progress").then(m => ({ default: m.Progress })));
const Profile       = lazy(() => import("@/components/Profile").then(m => ({ default: m.Profile })));
const Settings      = lazy(() => import("@/components/Settings").then(m => ({ default: m.Settings })));
const LessonDetail  = lazy(() => import("@/components/LessonDetail").then(m => ({ default: m.LessonDetail })));
const ExamSimulator = lazy(() => import("@/components/ExamSimulator").then(m => ({ default: m.ExamSimulator })));
const ReadingSession  = lazy(() => import("@/components/ReadingSession").then(m => ({ default: m.ReadingSession })));
const WritingSession  = lazy(() => import("@/components/WritingSession").then(m => ({ default: m.WritingSession })));
const FlashcardSession = lazy(() => import("@/components/FlashcardSession").then(m => ({ default: m.FlashcardSession })));
const VocabularyQuiz   = lazy(() => import("@/components/VocabularyQuiz").then(m => ({ default: m.VocabularyQuiz })));
const GrammarRitual    = lazy(() => import("@/components/GrammarRitual").then(m => ({ default: m.GrammarRitual })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[40vh]">
      <div className="w-8 h-8 border-2 border-white/10 border-t-white rounded-full animate-spin" />
    </div>
  );
}

function LessonDetailWrapper() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  return <LessonDetail lessonId={lessonId || null} onBack={() => navigate("/library")} />;
}

function ExamSimulatorWrapper() {
  const { profile } = useAuth();
  if (!profile) return null;
  return <ExamSimulator profile={profile} />;
}

function SessionWrapper() {
  const { sessionType } = useParams<{ sessionType: string }>();
  const navigate = useNavigate();
  const handleExit = () => navigate("/practice");

  if (sessionType === "reading") return <ReadingSession onBack={handleExit} />;
  if (sessionType === "writing") return <WritingSession onBack={handleExit} />;
  if (sessionType === "quiz") return <FlashcardSession onExit={handleExit} />;
  if (sessionType === "vocab") return <VocabularyQuiz onBack={handleExit} />;
  if (sessionType === "grammar") return <GrammarRitual onExit={handleExit} />;
  return <Navigate to="/dashboard" replace />;
}

function AuthenticatedApp() {
  const auth = useAuth();
  const navigate = useNavigate();

  if (auth.isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0d0d0f]">
        <div className="w-12 h-12 border-[2px] border-white/10 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/auth"
        element={
          auth.isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Auth onSignIn={auth.signIn} onSignUp={auth.signUp} onGoogleSignIn={auth.signInWithGoogle} />
          )
        }
      />
      
      {/* Protected Routes nested under Index Layout */}
      <Route
        path="/"
        element={
          auth.isAuthenticated ? (
            <Index />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
        <Route path="library" element={<Suspense fallback={<PageLoader />}><Library onLessonSelect={(id) => navigate(`/library/${id}`)} /></Suspense>} />
        <Route path="library/:lessonId" element={<Suspense fallback={<PageLoader />}><LessonDetailWrapper /></Suspense>} />
        <Route path="practice" element={<Suspense fallback={<PageLoader />}><Practice /></Suspense>} />
        <Route path="practice/exam" element={<Suspense fallback={<PageLoader />}><ExamSimulatorWrapper /></Suspense>} />
        <Route path="progress" element={<Suspense fallback={<PageLoader />}><Progress /></Suspense>} />
        <Route path="profile" element={<Suspense fallback={<PageLoader />}><Profile /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
        <Route path="session/:sessionType" element={<Suspense fallback={<PageLoader />}><SessionWrapper /></Suspense>} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => {
  const [queryClient] = React.useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes default stale time
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppPreferencesProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <OfflineIndicator />
              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <ErrorBoundary>
                  <AuthenticatedApp />
                </ErrorBoundary>
              </BrowserRouter>
            </TooltipProvider>
          </AppPreferencesProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
