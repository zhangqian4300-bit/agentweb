class AgentWebError(Exception):
    pass


class AgentWebConnectionError(AgentWebError):
    pass


class AuthenticationError(AgentWebError):
    pass


class RegistrationError(AgentWebError):
    pass
