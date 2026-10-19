import { NextResponse } from "next/server";

/** Legacy mock account/check APIs only serve /dev tools. Live cases use /api/operator. */
export function proxy() {
  if(process.env.NODE_ENV==="production")return NextResponse.json({error:"not_found"},{status:404});
  return NextResponse.next();
}
export const config={matcher:["/api/checks/:path*","/api/url-images","/api/auth/:path*","/api/history","/api/account","/api/me","/auth/callback"]};
