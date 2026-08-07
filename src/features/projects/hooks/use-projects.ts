/* eslint-disable react-hooks/purity */

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

export const useProject = (projectId: Id<"projects">) => {
  return useQuery(api.projects.getById, { id: projectId });
};

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
    (localStorage, args) => { // convex in memory query cache
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

export const useRenameProject = () => {
  return useMutation(api.projects.rename).withOptimisticUpdate(
    (localStore, args) => {
      // Update single-project cache (used by editor title, detail views)
      const existingProject = localStore.getQuery(api.projects.getById, {
        id: args.id,
      });

      if (existingProject !== undefined && existingProject !== null) {
        localStore.setQuery(
          api.projects.getById,
          { id: args.id },
          {
            ...existingProject,
            name: args.name,
            updatedAt: Date.now(),
          },
        );
      }

      // Update all-projects cache (used by sidebar, project list)
      const existingProjects = localStore.getQuery(api.projects.get);

      if (existingProjects !== undefined) {
        localStore.setQuery(
          api.projects.get,
          {},
          existingProjects.map((project) =>
            project._id === args.id
              ? { ...project, name: args.name, updatedAt: Date.now() }
              : project,
          ),
        );
      }
    },
  );
};

export const useUpdateProjectSettings = () => {
  return useMutation(api.projects.updateSettings);
};