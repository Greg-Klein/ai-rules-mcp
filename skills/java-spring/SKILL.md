---
name: java-spring
description: Java & Spring Boot best practices
patterns:
  - "**/*.java"
  - "**/pom.xml"
  - "**/build.gradle*"
  - "**/application*.yml"
tags: [java, spring, spring-boot, backend]
priority: high
---

## Architecture

- Follow **hexagonal architecture**: domain core has no framework dependencies.
- Separate layers: Controller → Service → Repository.
- Use DTOs at API boundaries — never expose JPA entities directly.

## Spring Boot

- Use constructor injection (not `@Autowired` on fields).
- Prefer `@ConfigurationProperties` over `@Value`.
- Use `@ControllerAdvice` for centralized error handling.

## Data Access

- Always paginate list endpoints: `Pageable` parameter.
- Use `@Transactional(readOnly = true)` for read operations.
- Beware N+1 queries: use `@EntityGraph` or `JOIN FETCH`.

## Anti-patterns

- ❌ Business logic in controllers.
- ❌ `@Autowired` field injection.
- ❌ Catching `Exception` broadly — catch specific types.
