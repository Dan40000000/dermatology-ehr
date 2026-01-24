/**
 * ServiceContainer Tests
 *
 * Unit tests for the dependency injection container.
 */

import { ServiceContainer } from "../ServiceContainer";

describe("ServiceContainer", () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = new ServiceContainer();
  });

  describe("register", () => {
    it("should register a transient service", () => {
      let callCount = 0;
      container.register("testService", () => {
        callCount++;
        return { id: callCount };
      });

      expect(container.has("testService")).toBe(true);
      expect(container.isSingleton("testService")).toBe(false);
    });

    it("should create new instance on each get for transient services", () => {
      let callCount = 0;
      container.register("testService", () => {
        callCount++;
        return { id: callCount };
      });

      const instance1 = container.get<{ id: number }>("testService");
      const instance2 = container.get<{ id: number }>("testService");

      expect(instance1.id).toBe(1);
      expect(instance2.id).toBe(2);
      expect(callCount).toBe(2);
    });

    it("should warn when overwriting a service", () => {
      container.register("testService", () => ({ value: 1 }));

      // Second registration should not throw
      expect(() => {
        container.register("testService", () => ({ value: 2 }));
      }).not.toThrow();

      // Should use the new factory
      expect(container.get<{ value: number }>("testService").value).toBe(2);
    });
  });

  describe("registerSingleton", () => {
    it("should register a singleton service", () => {
      container.registerSingleton("singletonService", () => ({ name: "singleton" }));

      expect(container.has("singletonService")).toBe(true);
      expect(container.isSingleton("singletonService")).toBe(true);
    });

    it("should return same instance on multiple gets", () => {
      let callCount = 0;
      container.registerSingleton("singletonService", () => {
        callCount++;
        return { id: callCount };
      });

      const instance1 = container.get<{ id: number }>("singletonService");
      const instance2 = container.get<{ id: number }>("singletonService");

      expect(instance1).toBe(instance2);
      expect(callCount).toBe(1);
    });

    it("should lazily initialize singleton", () => {
      let initialized = false;
      container.registerSingleton("lazyService", () => {
        initialized = true;
        return { initialized };
      });

      expect(initialized).toBe(false);
      expect(container.isInstantiated("lazyService")).toBe(false);

      container.get("lazyService");

      expect(initialized).toBe(true);
      expect(container.isInstantiated("lazyService")).toBe(true);
    });
  });

  describe("registerInstance", () => {
    it("should register a pre-created instance", () => {
      const instance = { name: "preCreated" };
      container.registerInstance("preCreatedService", instance);

      const retrieved = container.get<typeof instance>("preCreatedService");

      expect(retrieved).toBe(instance);
      expect(container.isSingleton("preCreatedService")).toBe(true);
      expect(container.isInstantiated("preCreatedService")).toBe(true);
    });
  });

  describe("get", () => {
    it("should throw when service is not registered", () => {
      expect(() => {
        container.get("nonExistent");
      }).toThrow("Service 'nonExistent' is not registered");
    });

    it("should include available services in error message", () => {
      container.register("service1", () => ({}));
      container.register("service2", () => ({}));

      expect(() => {
        container.get("nonExistent");
      }).toThrow(/Available services: service1, service2/);
    });

    it("should detect circular dependencies", () => {
      container.register("serviceA", () => {
        container.get("serviceB");
        return {};
      });
      container.register("serviceB", () => {
        container.get("serviceA");
        return {};
      });

      expect(() => {
        container.get("serviceA");
      }).toThrow(/Circular dependency detected/);
    });
  });

  describe("tryGet", () => {
    it("should return undefined for unregistered service", () => {
      const result = container.tryGet("nonExistent");
      expect(result).toBeUndefined();
    });

    it("should return instance for registered service", () => {
      container.register("testService", () => ({ value: 42 }));

      const result = container.tryGet<{ value: number }>("testService");

      expect(result).toBeDefined();
      expect(result?.value).toBe(42);
    });
  });

  describe("has", () => {
    it("should return true for registered service", () => {
      container.register("testService", () => ({}));
      expect(container.has("testService")).toBe(true);
    });

    it("should return false for unregistered service", () => {
      expect(container.has("nonExistent")).toBe(false);
    });
  });

  describe("unregister", () => {
    it("should remove a registered service", () => {
      container.register("testService", () => ({}));
      expect(container.has("testService")).toBe(true);

      const result = container.unregister("testService");

      expect(result).toBe(true);
      expect(container.has("testService")).toBe(false);
    });

    it("should return false when service does not exist", () => {
      const result = container.unregister("nonExistent");
      expect(result).toBe(false);
    });
  });

  describe("getRegisteredServices", () => {
    it("should return all registered service names", () => {
      container.register("service1", () => ({}));
      container.registerSingleton("service2", () => ({}));
      container.register("service3", () => ({}));

      const services = container.getRegisteredServices();

      expect(services).toContain("service1");
      expect(services).toContain("service2");
      expect(services).toContain("service3");
      expect(services.length).toBe(3);
    });
  });

  describe("reset", () => {
    it("should clear all registrations", () => {
      container.register("service1", () => ({}));
      container.registerSingleton("service2", () => ({}));

      container.reset();

      expect(container.has("service1")).toBe(false);
      expect(container.has("service2")).toBe(false);
      expect(container.getRegisteredServices().length).toBe(0);
    });
  });

  describe("resetInstances", () => {
    it("should clear singleton instances but keep registrations", () => {
      let callCount = 0;
      container.registerSingleton("singletonService", () => {
        callCount++;
        return { id: callCount };
      });

      // First get
      const instance1 = container.get<{ id: number }>("singletonService");
      expect(instance1.id).toBe(1);
      expect(container.isInstantiated("singletonService")).toBe(true);

      // Reset instances
      container.resetInstances();
      expect(container.isInstantiated("singletonService")).toBe(false);
      expect(container.has("singletonService")).toBe(true);

      // Second get should create new instance
      const instance2 = container.get<{ id: number }>("singletonService");
      expect(instance2.id).toBe(2);
    });
  });

  describe("createChild", () => {
    it("should create child container with inherited registrations", () => {
      container.register("parentService", () => ({ from: "parent" }));
      container.registerSingleton("sharedSingleton", () => ({ shared: true }));

      const child = container.createChild();

      expect(child.has("parentService")).toBe(true);
      expect(child.has("sharedSingleton")).toBe(true);
    });

    it("should allow child to override parent registrations", () => {
      container.register("testService", () => ({ from: "parent" }));

      const child = container.createChild();
      child.register("testService", () => ({ from: "child" }));

      expect(container.get<{ from: string }>("testService").from).toBe("parent");
      expect(child.get<{ from: string }>("testService").from).toBe("child");
    });

    it("should not share singleton instances with parent", () => {
      let callCount = 0;
      container.registerSingleton("singletonService", () => {
        callCount++;
        return { id: callCount };
      });

      // Parent instance
      container.get("singletonService");

      // Create child
      const child = container.createChild();

      // Child should get new instance
      const childInstance = child.get<{ id: number }>("singletonService");
      expect(childInstance.id).toBe(2);
    });
  });

  describe("type safety", () => {
    interface IMyService {
      doSomething(): string;
    }

    it("should work with typed services", () => {
      const myService: IMyService = {
        doSomething: () => "done",
      };

      container.registerInstance<IMyService>("myService", myService);

      const retrieved = container.get<IMyService>("myService");

      expect(retrieved.doSomething()).toBe("done");
    });
  });
});
