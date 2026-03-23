import Link from "next/link";
import { ArrowRight, BadgeCheck, Fingerprint, Landmark, Leaf, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

const features = [
    {
        icon: Fingerprint,
        title: "Privacy-first Identity",
        description:
            "Anon Aadhaar verification confirms artisan authenticity without exposing sensitive personal details."
    },
    {
        icon: Sparkles,
        title: "AI Proof of Craft",
        description:
            "Image intelligence scores workshop evidence and helps block low-confidence submissions before minting."
    },
    {
        icon: Landmark,
        title: "Dynamic Royalties",
        description:
            "Quadratic royalty taper ensures artisans receive fair ongoing compensation while enabling healthy secondary markets."
    },
    {
        icon: ShieldCheck,
        title: "Trustable Provenance",
        description:
            "Every product journey is permanently recorded and queryable from origin artisan to current owner."
    }
];

const steps = [
    {
        number: "01",
        title: "Verify Your Identity",
        description: "Register your artisan profile with privacy-preserving Anon Aadhaar verification.",
        href: "/artisan",
        action: "Start Registration"
    },
    {
        number: "02",
        title: "Register Your Product",
        description: "Upload product proof, create a permanent fingerprint, and anchor it on the blockchain.",
        href: "/register-product",
        action: "Register Product"
    },
    {
        number: "03",
        title: "Transfer and Earn",
        description: "Transfer ownership to buyers while automatically receiving your artisan royalty.",
        href: "/transfer",
        action: "Learn About Transfers"
    },
    {
        number: "04",
        title: "Verify Authenticity",
        description: "Anyone can verify a product's complete history and authenticity using its unique hash.",
        href: "/verify",
        action: "Try Verification"
    }
];

export default function HomePage() {
    return (
        <section style={{ display: "grid", gap: "var(--space-2xl)" }}>
            {/* Hero Section */}
            <Card className="overflow-hidden border-[#d8cab5] bg-gradient-to-br from-[#fff8ef] via-[#f7f2e9] to-[#eef6f2]">
                <CardHeader className="gap-4 pb-4">
                    <Badge variant="warm" className="w-fit">
                        Sovereign Traceability System
                    </Badge>
                    <CardTitle className="text-3xl leading-tight md:text-4xl lg:text-5xl text-balance">
                        Build Trust for Every Handmade Product
                    </CardTitle>
                    <CardDescription className="max-w-3xl text-base md:text-lg leading-relaxed">
                        Pramaan helps artisans prove origin, certify craft integrity, and receive fair long-term royalties through
                        privacy-preserving identity and on-chain provenance.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3 pt-2">
                    <Link href="/artisan">
                        <Button size="lg" className="gap-2">
                            Get Started
                            <ArrowRight size={16} />
                        </Button>
                    </Link>
                    <Link href="#how-it-works">
                        <Button size="lg" variant="secondary" type="button">
                            How It Works
                        </Button>
                    </Link>
                </CardContent>
            </Card>

            {/* Why Pramaan */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl">Why Pramaan?</CardTitle>
                    <CardDescription className="text-base">
                        Trust in handcrafted products should be cryptographically verifiable, economically fair, and easy for everyone to understand.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-[#e2d3be] bg-[#fff7ee] p-5">
                        <div className="mb-3 flex items-center gap-2 font-semibold text-[#8b4d33]">
                            <Leaf size={18} />
                            Preserve Heritage
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Give traditional artisans a digital trust layer without requiring them to share more data than needed.
                        </p>
                    </div>
                    <div className="rounded-xl border border-[#d4e4dd] bg-[#f1f9f5] p-5">
                        <div className="mb-3 flex items-center gap-2 font-semibold text-[#205746]">
                            <BadgeCheck size={18} />
                            Reduce Fraud
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Make origin and handling auditable so buyers can verify product authenticity with confidence.
                        </p>
                    </div>
                    <div className="rounded-xl border border-[#dae2e7] bg-[#f7fafc] p-5">
                        <div className="mb-3 flex items-center gap-2 font-semibold text-[#345061]">
                            <ShieldCheck size={18} />
                            Fair Rewards
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Incentivize verified behavior with dynamic artisan royalties on every secondary sale.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Core Features */}
            <section id="core-features" style={{ display: "grid", gap: "var(--space-lg)" }}>
                <h2 className="text-2xl font-bold text-[#20473d]">Core Features</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    {features.map((feature) => {
                        const Icon = feature.icon;
                        return (
                            <Card key={feature.title}>
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-3 text-lg">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#e8f5f1] text-[#1D9E75]">
                                            <Icon size={20} />
                                        </div>
                                        {feature.title}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-slate-600 leading-relaxed">{feature.description}</p>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </section>

            {/* How It Works */}
            <section id="how-it-works" style={{ display: "grid", gap: "var(--space-lg)" }}>
                <div>
                    <h2 className="text-2xl font-bold text-[#20473d]">How It Works</h2>
                    <p className="text-slate-600 mt-1">Follow this guided journey from identity verification to product traceability.</p>
                </div>
                <div className="grid gap-4">
                    {steps.map((step) => (
                        <Card key={step.number} className="overflow-hidden">
                            <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
                                <div className="flex gap-4 items-start">
                                    <div 
                                        className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f5f1] text-[#1D9E75] font-bold text-lg flex-shrink-0"
                                    >
                                        {step.number}
                                    </div>
                                    <div>
                                        <div className="text-lg font-semibold text-[#20473d]">{step.title}</div>
                                        <div className="text-sm text-slate-600 mt-1 leading-relaxed">{step.description}</div>
                                    </div>
                                </div>
                                <Link href={step.href} className="flex-shrink-0">
                                    <Button variant="secondary" className="gap-2 w-full md:w-auto">
                                        {step.action}
                                        <ArrowRight size={16} />
                                    </Button>
                                </Link>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </section>

            {/* Demo CTA */}
            <Card className="border-[#d4e4dd] bg-[#f1f9f5]">
                <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-[#205746]">Ready to See It in Action?</h3>
                        <p className="text-sm text-slate-600 mt-1">
                            Follow our demo checklist to experience the complete Pramaan workflow.
                        </p>
                    </div>
                    <Link href="/checklist" className="flex-shrink-0">
                        <Button className="gap-2 w-full md:w-auto">
                            View Demo Checklist
                            <ArrowRight size={16} />
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        </section>
    );
}
