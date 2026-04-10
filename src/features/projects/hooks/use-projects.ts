/* eslint-disable react-hooks/purity */

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

export const useProjects = () => {
  const projects = useQuery(api.projects.get);
  return projects;
};

export const useProjectsPartial = (limit: number) => {
  return useQuery(api.projects.getPartial, { limit });
};

export const useCreateProject = () => {
  const now = Date.now();
  const id = crypto.randomUUID() as Id<"projects">;

  return useMutation(api.projects.create).withOptimisticUpdate(
    (localStorage, args) => {
      const existingProjects = localStorage.getQuery(api.projects.get);

      if (existingProjects !== undefined) {
        // Temporary placeholder — replaced by real server data after mutation completes
        const newProject = {
          _id: id,
          _creationTime: now,
          name: args.name,
          ownerId: "anonymous",
          updatedAt: now,
        };
        localStorage.setQuery(api.projects.get, {}, [
          ...existingProjects,
          newProject,
        ]);
      }
    },
  );
};
