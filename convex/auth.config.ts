const clientId = process.env.WORKOS_CLIENT_ID;

export default {
  providers: [
    {
      type: "customJwt",
      issuer: `https://api.workos.com/sso/oidc/user_management/${clientId}`,
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      applicationID: clientId,
    },
  ],
};
