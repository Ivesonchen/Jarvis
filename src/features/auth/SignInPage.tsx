import { Copy, ExternalLink, Github, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { useAuth, useCancelDeviceFlow, useStartDeviceFlow } from "./useAuth";

export default function SignInPage() {
    const navigate = useNavigate();
    const auth = useAuth();
    const startDeviceFlow = useStartDeviceFlow();
    const cancelDeviceFlow = useCancelDeviceFlow();
    const [copied, setCopied] = useState(false);

    // If we're already authenticated, drop straight into the chat home.
    useEffect(() => {
        if (auth.data?.authenticated) {
            navigate("/", { replace: true });
        }
    }, [auth.data?.authenticated, navigate]);

    // Cancel any in-flight device flow if the user navigates away.
    useEffect(() => {
        return () => {
            if (startDeviceFlow.data && !startDeviceFlow.isError) {
                cancelDeviceFlow.mutate();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const deviceCode = startDeviceFlow.data?.userCode;
    const verificationUri = startDeviceFlow.data?.verificationUri;

    const handleCopy = async (): Promise<void> => {
        if (!deviceCode) return;
        await navigator.clipboard.writeText(deviceCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const handleOpenBrowser = async (): Promise<void> => {
        if (!verificationUri) return;
        await window.appAPI.openExternal(verificationUri);
    };

    return (
        <div className="flex h-full w-full items-center justify-center p-6">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <Github className="h-5 w-5" />
                        Sign in to GitHub
                    </CardTitle>
                    <CardDescription>
                        Javis uses your GitHub Copilot subscription. Sign in once and we'll keep you logged in.
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                    {!deviceCode && (
                        <>
                            <Button
                                size="lg"
                                className="w-full"
                                onClick={() => startDeviceFlow.mutate()}
                                disabled={startDeviceFlow.isPending}
                            >
                                {startDeviceFlow.isPending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Starting…
                                    </>
                                ) : (
                                    <>
                                        <Github className="h-4 w-4" />
                                        Sign in with GitHub
                                    </>
                                )}
                            </Button>
                            {startDeviceFlow.isError && (
                                <p className="text-sm text-(--destructive)">
                                    {startDeviceFlow.error.message}
                                </p>
                            )}
                        </>
                    )}

                    {deviceCode && (
                        <div className="space-y-3">
                            <p className="text-sm text-(--muted-foreground)">
                                Enter this code in the GitHub device-login page:
                            </p>

                            <div className="flex items-center justify-between rounded-md border border-(--border) bg-(--secondary) px-4 py-3">
                                <code className="select-all font-mono text-2xl tracking-widest">
                                    {deviceCode}
                                </code>
                                <Button variant="ghost" size="icon" onClick={handleCopy} title="Copy code">
                                    <Copy className="h-4 w-4" />
                                </Button>
                            </div>
                            {copied && (
                                <p className="text-xs text-(--muted-foreground)">Copied to clipboard.</p>
                            )}

                            <Button variant="outline" className="w-full" onClick={handleOpenBrowser}>
                                <ExternalLink className="h-4 w-4" />
                                Open {verificationUri ?? "github.com"}
                            </Button>

                            <div className="flex items-center gap-2 text-xs text-(--muted-foreground)">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Waiting for you to complete sign-in…
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
